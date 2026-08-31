package com.aetherflow.ai.task;

import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiJobLeaseServiceTest {

    @Test
    void createsNewRunningJobWithFencedLease() {
        AiJobMapper mapper = mock(AiJobMapper.class);
        AiJobLeaseService service = new AiJobLeaseService(mapper);
        LocalDateTime now = LocalDateTime.parse("2026-08-30T23:00:00");
        doAnswer(invocation -> {
            invocation.getArgument(0, AiJob.class).setId(101L);
            return 1;
        }).when(mapper).insertAiJobWithLease(any(AiJob.class), anyLong());
        when(mapper.selectById(101L)).thenReturn(runningJob("lease-1", now.plusMinutes(2), 1));

        var acquisition = service.acquire(
                task(), "{}", "59:node-1", now, Duration.ofMinutes(2), "lease-1");

        assertThat(acquisition.status()).isEqualTo(AiJobLeaseService.AcquisitionStatus.ACQUIRED);
        assertThat(acquisition.lease().jobId()).isEqualTo(101L);
        assertThat(acquisition.lease().token()).isEqualTo("lease-1");
        assertThat(acquisition.lease().expiresAt()).isEqualTo(now.plusMinutes(2));
        assertThat(acquisition.job().getAttemptCount()).isEqualTo(1);
        assertThat(acquisition.job().getLeaseToken()).isEqualTo("lease-1");
    }

    @Test
    void databaseRejectsActiveLeaseWithoutTrustingJvmWallClock() {
        AiJobMapper mapper = mock(AiJobMapper.class);
        AiJobLeaseService service = new AiJobLeaseService(mapper);
        LocalDateTime now = LocalDateTime.parse("2026-08-30T23:00:00");
        AiJob running = runningJob(now.plusSeconds(45));
        when(mapper.selectByIdempotencyKey("59:node-1")).thenReturn(running);
        when(mapper.claimAiJobLease(101L, "lease-new", 120_000_000L)).thenReturn(0);

        var acquisition = service.acquire(
                task(), "{}", "59:node-1", now, Duration.ofMinutes(2), "lease-new");

        assertThat(acquisition.status()).isEqualTo(AiJobLeaseService.AcquisitionStatus.BUSY);
        assertThat(acquisition.retryAfter()).isEqualTo(Duration.ofSeconds(30));
        verify(mapper).claimAiJobLease(101L, "lease-new", 120_000_000L);
    }

    @Test
    void expiredRunningLeaseCanBeClaimedByExactlyOneNewToken() {
        AiJobMapper mapper = mock(AiJobMapper.class);
        AiJobLeaseService service = new AiJobLeaseService(mapper);
        LocalDateTime now = LocalDateTime.parse("2026-08-30T23:00:00");
        AiJob expired = runningJob(now.minusSeconds(1));
        when(mapper.selectByIdempotencyKey("59:node-1")).thenReturn(expired);
        when(mapper.claimAiJobLease(101L, "lease-new", 120_000_000L)).thenReturn(1);
        when(mapper.selectById(101L)).thenReturn(runningJob("lease-new", now.plusMinutes(2), 2));

        var acquisition = service.acquire(
                task(), "{}", "59:node-1", now, Duration.ofMinutes(2), "lease-new");

        assertThat(acquisition.status()).isEqualTo(AiJobLeaseService.AcquisitionStatus.ACQUIRED);
        assertThat(acquisition.lease().token()).isEqualTo("lease-new");
        assertThat(acquisition.job().getAttemptCount()).isEqualTo(2);
    }

    @Test
    void heartbeatFailsClosedWhenLeaseTokenLostOwnership() {
        AiJobMapper mapper = mock(AiJobMapper.class);
        AiJobLeaseService service = new AiJobLeaseService(mapper);
        LocalDateTime now = LocalDateTime.parse("2026-08-30T23:00:30");
        when(mapper.renewAiJobLease(101L, "lease-1", 120_000_000L)).thenReturn(0);

        boolean renewed = service.renew(new AiJobLease(101L, "lease-1", now.plusSeconds(30)), now, Duration.ofMinutes(2));

        assertThat(renewed).isFalse();
    }

    private TaskMessageDTO task() {
        TaskMessageDTO task = new TaskMessageDTO();
        task.setTaskId(59L);
        task.setWorkflowInstanceId(100L);
        task.setNodeId("node-1");
        task.setNodeType("LLM");
        return task;
    }

    private AiJob runningJob(LocalDateTime expiresAt) {
        return runningJob("lease-old", expiresAt, 1);
    }

    private AiJob runningJob(String token, LocalDateTime expiresAt, int attemptCount) {
        AiJob job = new AiJob();
        job.setId(101L);
        job.setIdempotencyKey("59:node-1");
        job.setStatus(AiTaskStatus.RUNNING);
        job.setLeaseToken(token);
        job.setLeaseExpiresAt(expiresAt);
        job.setAttemptCount(attemptCount);
        return job;
    }
}
