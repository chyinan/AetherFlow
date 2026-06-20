package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 为 AI 节点的同步远程调用（Feign -> ai-service）提供节点级超时兜底。
 *
 * <p>背景：Feign readTimeout 默认 30 分钟，AI 节点会同步阻塞占用 workflow-runtime 线程，
 * 一旦上游长时间无响应，工作流实例会长期卡在 RUNNING。本类将阻塞调用转成带超时的 Future
 * 调用，超时后抛出明确异常，使节点能被重试或由 DAG Runtime 标记为 FAILED 并记录原因。
 *
 * <p>注意：超时后底层 Feign 调用可能仍在运行（阻塞 IO 不一定响应 interrupt），这里通过
 * future.cancel(true) 尽力中断，并以抛出异常的方式让上层尽快进入失败处理路径。
 */
@Slf4j
@Component
public class AiNodeCallTimeoutGuard {

    private final Duration callTimeout;
    private final ExecutorService executor;
    private final AtomicLong threadCounter = new AtomicLong();

    public AiNodeCallTimeoutGuard(
            @Value("${aetherflow.workflow.node.ai-call-timeout:10m}") Duration callTimeout) {
        this.callTimeout = callTimeout == null ? Duration.ZERO : callTimeout;
        // cached 线程池：并发受上游 workflowRuntimeTaskExecutor(max50) 限制，不会无限增长；
        // 仅用于把阻塞调用包装成可超时的 Future，daemon 线程随 JVM 退出。
        this.executor = Executors.newCachedThreadPool(task -> {
            Thread thread = new Thread(task, "workflow-ai-node-call-" + threadCounter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        });
    }

    public <T> T executeWithTimeout(Callable<T> task, String description) {
        if (callTimeout.isZero() || callTimeout.isNegative()) {
            return callDirectly(task, description);
        }
        Future<T> future = executor.submit(task);
        try {
            return future.get(callTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException timeout) {
            future.cancel(true);
            log.error("ai node call timed out, callTimeout={}, description={}", callTimeout, description);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "ai node call timed out after " + callTimeout + ", description=" + description);
        } catch (InterruptedException interrupt) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "ai node call interrupted, description=" + description);
        } catch (ExecutionException executionException) {
            Throwable cause = executionException.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            if (cause instanceof Error error) {
                throw error;
            }
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "ai node call failed, description=" + description
                            + ", reason=" + (cause == null ? "unknown" : cause.getMessage()));
        }
    }

    private static <T> T callDirectly(Callable<T> task, String description) {
        try {
            return task.call();
        } catch (RuntimeException runtimeException) {
            throw runtimeException;
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "ai node call failed, description=" + description
                            + ", reason=" + exception.getMessage());
        }
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
