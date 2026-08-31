package com.aetherflow.ai.task;

// pattern: Imperative Shell

import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class AiJobLeaseService {

    private static final Duration MAX_LEASE_DURATION = Duration.ofDays(1);

    private final AiJobMapper mapper;

    public Acquisition acquire(TaskMessageDTO taskMessage,
                               String payloadJson,
                               String idempotencyKey,
                               LocalDateTime now,
                               Duration leaseDuration,
                               String leaseToken) {
        validate(taskMessage, idempotencyKey, now, leaseDuration, leaseToken);
        Long userId = scopeUserId(taskMessage);
        AiJob existing = taskMessage.getUserId() == null
                ? mapper.selectByIdempotencyKey(idempotencyKey)
                : mapper.selectByIdempotencyKey(userId, idempotencyKey);
        if (existing == null) {
            return create(taskMessage, payloadJson, idempotencyKey, now, leaseDuration, leaseToken);
        }
        return acquireExisting(existing, taskMessage, payloadJson, now, leaseDuration, leaseToken);
    }

    public boolean renew(AiJobLease lease, LocalDateTime now, Duration leaseDuration) {
        return renewLease(lease, now, leaseDuration).isPresent();
    }

    public Optional<AiJobLease> renewLease(AiJobLease lease, LocalDateTime now, Duration leaseDuration) {
        if (lease == null || lease.jobId() == null || lease.token() == null || lease.token().isBlank()) {
            return Optional.empty();
        }
        Duration duration = requireLeaseDuration(leaseDuration);
        if (mapper.renewAiJobLease(lease.jobId(), lease.token(), leaseMicros(duration)) != 1) {
            return Optional.empty();
        }
        AiJob renewed = mapper.selectById(lease.jobId());
        if (renewed == null || !lease.token().equals(renewed.getLeaseToken())
                || renewed.getLeaseExpiresAt() == null) {
            return Optional.empty();
        }
        return Optional.of(new AiJobLease(renewed.getId(), renewed.getLeaseToken(), renewed.getLeaseExpiresAt()));
    }

    private Acquisition create(TaskMessageDTO taskMessage,
                               String payloadJson,
                               String idempotencyKey,
                               LocalDateTime now,
                               Duration leaseDuration,
                               String leaseToken) {
        AiJob job = new AiJob();
        job.setTaskId(taskMessage.getTaskId());
        job.setUserId(scopeUserId(taskMessage));
        job.setIdempotencyKey(idempotencyKey);
        job.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        job.setJobType(taskMessage.getNodeType());
        job.setInputJson(payloadJson);
        job.setStatus(AiTaskStatus.RUNNING);
        job.setLeaseToken(leaseToken);
        job.setAttemptCount(1);
        try {
            mapper.insertAiJobWithLease(job, leaseMicros(leaseDuration));
            return acquired(authoritative(job.getId()));
        } catch (DuplicateKeyException duplicate) {
            AiJob raced = taskMessage.getUserId() == null
                    ? mapper.selectByIdempotencyKey(idempotencyKey)
                    : mapper.selectByIdempotencyKey(scopeUserId(taskMessage), idempotencyKey);
            if (raced == null) {
                throw duplicate;
            }
            return acquireExisting(raced, taskMessage, payloadJson, now, leaseDuration, leaseToken);
        }
    }

    private Acquisition acquireExisting(AiJob job,
                                        TaskMessageDTO taskMessage,
                                        String payloadJson,
                                        LocalDateTime now,
                                        Duration leaseDuration,
                                        String leaseToken) {
        if ((job.getTaskId() != null && !Objects.equals(job.getTaskId(), taskMessage.getTaskId()))
                || (job.getWorkflowInstanceId() != null && !Objects.equals(job.getWorkflowInstanceId(), taskMessage.getWorkflowInstanceId()))
                || (job.getJobType() != null && !Objects.equals(job.getJobType(), taskMessage.getNodeType()))
                || (job.getInputJson() != null && !Objects.equals(job.getInputJson(), payloadJson))) {
            throw new BusinessException(ResultCode.CONFLICT,
                    "ai job idempotency key was reused with different task context");
        }
        if (AiTaskStatus.SUCCEEDED.equals(job.getStatus())) {
            return new Acquisition(AcquisitionStatus.SUCCEEDED, job, null, Duration.ZERO);
        }
        if (AiTaskStatus.FAILED.equals(job.getStatus())) {
            return new Acquisition(AcquisitionStatus.FAILED, job, null, Duration.ZERO);
        }
        int claimed = mapper.claimAiJobLease(job.getId(), leaseToken, leaseMicros(leaseDuration));
        if (claimed != 1) {
            return new Acquisition(AcquisitionStatus.BUSY, job, null, leaseDuration.dividedBy(4));
        }
        return acquired(authoritative(job.getId()));
    }

    private AiJob authoritative(Long id) {
        AiJob job = id == null ? null : mapper.selectById(id);
        if (job == null || job.getLeaseToken() == null || job.getLeaseExpiresAt() == null) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR,
                    "database did not return the authoritative ai job lease");
        }
        return job;
    }

    private Acquisition acquired(AiJob job) {
        return new Acquisition(
                AcquisitionStatus.ACQUIRED,
                job,
                new AiJobLease(job.getId(), job.getLeaseToken(), job.getLeaseExpiresAt()),
                Duration.ZERO);
    }

    private void validate(TaskMessageDTO taskMessage,
                          String idempotencyKey,
                          LocalDateTime now,
                          Duration leaseDuration,
                          String leaseToken) {
        if (taskMessage == null || taskMessage.getTaskId() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai task message is required for lease acquisition");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai job idempotency key is required");
        }
        if (now == null || leaseToken == null || leaseToken.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai job lease context is incomplete");
        }
        requireLeaseDuration(leaseDuration);
    }

    private Long scopeUserId(TaskMessageDTO taskMessage) {
        return taskMessage.getUserId() == null ? 0L : taskMessage.getUserId();
    }

    private Duration requireLeaseDuration(Duration leaseDuration) {
        if (leaseDuration == null || leaseDuration.isZero() || leaseDuration.isNegative()
                || leaseDuration.compareTo(MAX_LEASE_DURATION) > 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai job lease duration must be positive");
        }
        return leaseDuration;
    }

    private long leaseMicros(Duration leaseDuration) {
        return Math.max(1L, leaseDuration.toNanos() / 1_000L);
    }

    public enum AcquisitionStatus {
        ACQUIRED,
        BUSY,
        SUCCEEDED,
        FAILED
    }

    public record Acquisition(
            AcquisitionStatus status,
            AiJob job,
            AiJobLease lease,
            Duration retryAfter
    ) {
    }
}
