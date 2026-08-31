package com.aetherflow.ai.task;

import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiJobLeaseHeartbeatTest {

    @Test
    void lostHeartbeatFencesWorkerBeforeItCanPublishResults() {
        AiJobLeaseService leaseService = mock(AiJobLeaseService.class);
        AiJobLease lease = new AiJobLease(101L, "lease-1", LocalDateTime.now().plusSeconds(1));
        when(leaseService.renewLease(eq(lease), any(LocalDateTime.class), eq(Duration.ofSeconds(1))))
                .thenReturn(Optional.empty());
        AiJobLeaseHeartbeat heartbeat = new AiJobLeaseHeartbeat(leaseService);

        try (AiJobLeaseHeartbeat.LeaseGuard guard = heartbeat.start(
                lease, Duration.ofSeconds(1), Duration.ofMillis(10))) {
            awaitCondition(() -> !guard.isOwned(), Duration.ofSeconds(1));

            assertThat(guard.isOwned()).isFalse();
            assertThatThrownBy(guard::assertOwned)
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("lease ownership lost");
        }
    }

    private void awaitCondition(java.util.function.BooleanSupplier condition, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) {
            Thread.onSpinWait();
        }
        assertThat(condition.getAsBoolean()).as("condition before timeout").isTrue();
    }
}
