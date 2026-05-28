package com.aetherflow.workflow.runtime.api;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RetryPolicyTest {

    @Test
    void calculatesBoundedExponentialBackoff() {
        RetryPolicy retryPolicy = RetryPolicy.of(4, Duration.ofMillis(100), 2.0, Duration.ofMillis(250));

        assertThat(retryPolicy.shouldRetry(1, new RuntimeException("boom"))).isTrue();
        assertThat(retryPolicy.shouldRetry(3, new RuntimeException("boom"))).isTrue();
        assertThat(retryPolicy.shouldRetry(4, new RuntimeException("boom"))).isFalse();
        assertThat(retryPolicy.delayForAttempt(1)).isEqualTo(Duration.ofMillis(100));
        assertThat(retryPolicy.delayForAttempt(2)).isEqualTo(Duration.ofMillis(200));
        assertThat(retryPolicy.delayForAttempt(3)).isEqualTo(Duration.ofMillis(250));
    }

    @Test
    void rejectsInvalidRetryPolicy() {
        assertThatThrownBy(() -> RetryPolicy.of(0, Duration.ZERO, 1.0, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("max attempts");
    }
}
