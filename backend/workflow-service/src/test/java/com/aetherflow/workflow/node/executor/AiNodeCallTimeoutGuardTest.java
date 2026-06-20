package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiNodeCallTimeoutGuardTest {

    @Test
    void returnsValueWhenCallableCompletesWithinTimeout() {
        AiNodeCallTimeoutGuard guard = new AiNodeCallTimeoutGuard(Duration.ofSeconds(2));

        String result = guard.executeWithTimeout(() -> "ok", "fast-node");

        assertThat(result).isEqualTo("ok");
    }

    @Test
    void throwsBusinessExceptionWhenCallableExceedsTimeout() {
        AiNodeCallTimeoutGuard guard = new AiNodeCallTimeoutGuard(Duration.ofMillis(100));
        Callable<String> slow = () -> {
            try {
                Thread.sleep(5000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return "slow";
        };

        long start = System.nanoTime();
        assertThatThrownBy(() -> guard.executeWithTimeout(slow, "slow-node"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("timed out")
                .hasMessageContaining("slow-node");
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        // 超时应在远小于 5s 的时间内触发，证明不会无限阻塞导致实例卡 RUNNING。
        assertThat(elapsedMs).isLessThan(2000L);
    }

    @Test
    void callsDirectlyWhenTimeoutDisabled() {
        AiNodeCallTimeoutGuard guard = new AiNodeCallTimeoutGuard(Duration.ZERO);
        AtomicBoolean executed = new AtomicBoolean(false);

        String result = guard.executeWithTimeout(() -> {
            executed.set(true);
            return "direct";
        }, "no-timeout");

        assertThat(result).isEqualTo("direct");
        assertThat(executed).isTrue();
    }

    @Test
    void propagatesRuntimeExceptionFromCallable() {
        AiNodeCallTimeoutGuard guard = new AiNodeCallTimeoutGuard(Duration.ofSeconds(2));
        IllegalStateException expected = new IllegalStateException("boom");

        assertThatThrownBy(() -> guard.executeWithTimeout(() -> {
            throw expected;
        }, "failing-node")).isSameAs(expected);
    }
}
