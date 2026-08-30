package com.aetherflow.ai.task;

import com.aetherflow.ai.cache.AiTaskCacheService;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.file.AiFileRegistrationService;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.outbox.AiTaskTerminalCoordinator;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.retry.RetryContext;
import org.springframework.retry.support.RetrySynchronizationManager;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
// pattern: Imperative Shell
public class AiTaskProcessingServiceImpl implements AiTaskProcessingService {

    private final AiJobMapper aiJobMapper;
    private final DefaultAiNodeExecutorRegistry executorRegistry;
    private final AiTaskCacheService cacheService;
    private final AiFileRegistrationService fileRegistrationService;
    private final AiTaskTerminalCoordinator terminalCoordinator;
    private final SentinelAiGuard sentinelAiGuard;
    private final ObjectMapper objectMapper;

    @Value("${spring.rabbitmq.listener.simple.retry.max-attempts:3}")
    private int listenerRetryMaxAttempts = 3;

    @Override
    public void process(TaskMessageDTO taskMessage) {
        sentinelAiGuard.run("ai-task-process", () -> doProcess(taskMessage));
    }

    private void doProcess(TaskMessageDTO taskMessage) {
        validateTask(taskMessage);
        Map<String, Object> payload = taskMessage.getPayload() == null ? Map.of() : new LinkedHashMap<>(taskMessage.getPayload());
        String idempotencyKey = idempotencyKey(taskMessage);
        AiJob existingJob = findJob(idempotencyKey);
        if (existingJob != null && AiTaskStatus.SUCCEEDED.equals(existingJob.getStatus())) {
            terminalCoordinator.publishPending(existingJob);
            log.info("AI task duplicate completed without model rerun taskId={}, nodeId={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId());
            return;
        }
        if (existingJob != null && AiTaskStatus.RUNNING.equals(existingJob.getStatus())) {
            log.info("AI task duplicate ignored taskId={}, nodeId={}, status={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId(), existingJob.getStatus());
            return;
        }
        if (existingJob != null && AiTaskStatus.FAILED.equals(existingJob.getStatus())) {
            // FAILED is terminal for this idempotency key. A redelivered message
            // must not invoke the model again; the durable outbox is the only
            // allowed side effect to replay.
            terminalCoordinator.publishPending(existingJob);
            log.info("AI task duplicate failed task ignored without model rerun taskId={}, nodeId={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId());
            return;
        }
        boolean firstAttempt = existingJob == null;
        AiJob job = firstAttempt
                ? createRunningJob(taskMessage, payload, idempotencyKey)
                : retryJob(existingJob, taskMessage, payload);
        if (job == null) {
            log.info("AI task duplicate ignored after idempotency race taskId={}, nodeId={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId());
            return;
        }
        cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.RUNNING);
        log.info("AI task started taskId={}, workflowInstanceId={}, nodeId={}, nodeType={}",
                taskMessage.getTaskId(), taskMessage.getWorkflowInstanceId(), taskMessage.getNodeId(), taskMessage.getNodeType());
        AiNodeResult result;
        try {
            AiNodeExecutor executor = executorRegistry.getRequired(taskMessage.getNodeType());
            result = executor.execute(new AiNodeExecutionContext(taskMessage, payload));
        } catch (RuntimeException exception) {
            String error = safeError(exception);
            if (retryExhausted()) {
                terminalCoordinator.recordFailure(job, taskMessage, error);
                cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.FAILED);
                cacheService.cacheError(taskMessage.getTaskId(), error);
                log.error("AI task failed after retries exhausted taskId={}, jobId={}",
                        taskMessage.getTaskId(), job.getId(), exception);
            } else {
                markRetrying(job, error);
                cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.RETRYING);
                log.warn("AI task attempt failed and will retry taskId={}, jobId={}, retryCount={}",
                        taskMessage.getTaskId(), job.getId(), currentRetryCount(), exception);
            }
            throw exception;
        }
        terminalCoordinator.recordSuccess(job, taskMessage, result);
        cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.SUCCEEDED);
        cacheService.cacheResult(taskMessage.getTaskId(), result.output());
        fileRegistrationService.registerArtifacts(result.artifacts());
        log.info("AI task succeeded taskId={}, jobId={}", taskMessage.getTaskId(), job.getId());
    }

    private void validateTask(TaskMessageDTO taskMessage) {
        if (taskMessage == null || taskMessage.getTaskId() == null || taskMessage.getNodeType() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "invalid ai task message");
        }
    }

    private AiJob findJob(String idempotencyKey) {
        return aiJobMapper.selectOne(new LambdaQueryWrapper<AiJob>()
                .eq(AiJob::getIdempotencyKey, idempotencyKey)
                .last("LIMIT 1"));
    }

    private AiJob createRunningJob(TaskMessageDTO taskMessage, Map<String, Object> payload, String idempotencyKey) {
        AiJob job = new AiJob();
        job.setTaskId(taskMessage.getTaskId());
        job.setIdempotencyKey(idempotencyKey);
        job.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        job.setJobType(taskMessage.getNodeType());
        job.setInputJson(writeJson(payload));
        job.setStatus(AiTaskStatus.RUNNING);
        job.setStartedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        try {
            aiJobMapper.insert(job);
        } catch (DuplicateKeyException exception) {
            return null;
        }
        return job;
    }

    private AiJob retryJob(AiJob job, TaskMessageDTO taskMessage, Map<String, Object> payload) {
        job.setTaskId(taskMessage.getTaskId());
        job.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        job.setJobType(taskMessage.getNodeType());
        job.setInputJson(writeJson(payload));
        job.setOutputJson(null);
        job.setStatus(AiTaskStatus.RUNNING);
        job.setStartedAt(LocalDateTime.now());
        job.setCompletedAt(null);
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.updateById(job);
        return job;
    }

    private void markRetrying(AiJob job, String error) {
        job.setOutputJson(writeJson(Map.of("error", error)));
        job.setStatus(AiTaskStatus.RETRYING);
        job.setCompletedAt(null);
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.updateById(job);
    }

    private boolean retryExhausted() {
        RetryContext retryContext = RetrySynchronizationManager.getContext();
        if (retryContext == null) {
            return true;
        }
        return retryContext.getRetryCount() >= Math.max(1, listenerRetryMaxAttempts) - 1;
    }

    private int currentRetryCount() {
        RetryContext retryContext = RetrySynchronizationManager.getContext();
        return retryContext == null ? 0 : retryContext.getRetryCount();
    }

    private String safeError(RuntimeException exception) {
        if (exception == null) {
            return "AI task failed";
        }
        String message = exception.getMessage();
        if (message != null && !message.isBlank()) {
            return message.trim();
        }
        return "AI task failed: " + exception.getClass().getSimpleName();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai job json serialization failed");
        }
    }

    private String idempotencyKey(TaskMessageDTO taskMessage) {
        String taskId = String.valueOf(taskMessage.getTaskId());
        String nodeId = taskMessage.getNodeId() == null || taskMessage.getNodeId().isBlank()
                ? ""
                : taskMessage.getNodeId().trim();
        return nodeId.isEmpty() ? taskId : taskId + ":" + nodeId;
    }
}
