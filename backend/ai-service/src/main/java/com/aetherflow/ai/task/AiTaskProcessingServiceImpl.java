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
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.retry.RetryContext;
import org.springframework.retry.support.RetrySynchronizationManager;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.time.Duration;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
// pattern: Imperative Shell
public class AiTaskProcessingServiceImpl implements AiTaskProcessingService {

    private final AiJobMapper aiJobMapper;
    private final AiJobLeaseService leaseService;
    private final AiJobLeaseHeartbeat leaseHeartbeat;
    private final DefaultAiNodeExecutorRegistry executorRegistry;
    private final AiTaskCacheService cacheService;
    private final AiFileRegistrationService fileRegistrationService;
    private final AiTaskTerminalCoordinator terminalCoordinator;
    private final SentinelAiGuard sentinelAiGuard;
    private final ObjectMapper objectMapper;

    @Value("${spring.rabbitmq.listener.simple.retry.max-attempts:3}")
    private int listenerRetryMaxAttempts = 3;

    @Value("${aetherflow.ai.job-lease-duration:2m}")
    private Duration jobLeaseDuration = Duration.ofMinutes(2);

    @Value("${aetherflow.ai.job-lease-heartbeat-interval:30s}")
    private Duration jobLeaseHeartbeatInterval = Duration.ofSeconds(30);

    @Override
    public void process(TaskMessageDTO taskMessage) {
        sentinelAiGuard.run("ai-task-process", () -> doProcess(taskMessage));
    }

    private void doProcess(TaskMessageDTO taskMessage) {
        validateTask(taskMessage);
        Map<String, Object> payload = taskMessage.getPayload() == null ? Map.of() : new LinkedHashMap<>(taskMessage.getPayload());
        String idempotencyKey = idempotencyKey(taskMessage);
        AiJobLeaseService.Acquisition acquisition = leaseService.acquire(
                taskMessage,
                writeJson(payload),
                idempotencyKey,
                LocalDateTime.now(),
                jobLeaseDuration,
                UUID.randomUUID().toString());
        if (acquisition.status() == AiJobLeaseService.AcquisitionStatus.SUCCEEDED) {
            terminalCoordinator.publishPending(acquisition.job());
            log.info("AI task duplicate completed without model rerun taskId={}, nodeId={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId());
            return;
        }
        if (acquisition.status() == AiJobLeaseService.AcquisitionStatus.BUSY) {
            throw new AiJobLeaseBusyException(acquisition.retryAfter());
        }
        if (acquisition.status() == AiJobLeaseService.AcquisitionStatus.FAILED) {
            terminalCoordinator.publishPending(acquisition.job());
            log.info("AI task duplicate failed task ignored without model rerun taskId={}, nodeId={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId());
            return;
        }
        AiJob job = acquisition.job();
        AiJobLease lease = acquisition.lease();
        cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.RUNNING);
        log.info("AI task started taskId={}, workflowInstanceId={}, nodeId={}, nodeType={}",
                taskMessage.getTaskId(), taskMessage.getWorkflowInstanceId(), taskMessage.getNodeId(), taskMessage.getNodeType());
        try (AiJobLeaseHeartbeat.LeaseGuard guard = leaseHeartbeat.start(
                lease, jobLeaseDuration, jobLeaseHeartbeatInterval)) {
            AiNodeResult durableResult;
            com.aetherflow.ai.file.ArtifactRegistrationResult artifactRegistration = null;
            try {
                AiNodeExecutor executor = executorRegistry.getRequired(taskMessage.getNodeType());
                AiNodeResult result = executor.execute(new AiNodeExecutionContext(taskMessage, payload));
                guard.assertOwned();
                com.aetherflow.ai.file.ArtifactRegistrationResult registration =
                        fileRegistrationService.registerArtifacts(taskMessage, lease, result.artifacts());
                artifactRegistration = registration;
                guard.assertOwned();
                durableResult = result.withStoredArtifactFiles(registration);
            } catch (RuntimeException exception) {
                if (!guard.isOwned()) {
                    throw exception;
                }
                String error = safeError(exception);
                if (retryExhausted()) {
                    if (artifactRegistration == null && exception instanceof com.aetherflow.ai.file.ArtifactRegistrationException registrationException) {
                        artifactRegistration = new com.aetherflow.ai.file.ArtifactRegistrationResult(
                                registrationException.batchId(), registrationException.expectedCount(), List.of());
                    }
                    AiNodeResult failureResult = artifactRegistration == null ? null : new AiNodeResult(
                            taskMessage.getNodeType(), AiTaskStatus.FAILED,
                            Map.of("error", error), List.of(), artifactRegistration.batchId(),
                            artifactRegistration.expectedCount());
                    if (failureResult == null) {
                        terminalCoordinator.recordFailure(job, lease, taskMessage, error);
                    } else {
                        terminalCoordinator.recordFailure(job, lease, taskMessage, failureResult, error);
                    }
                    cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.FAILED);
                    cacheService.cacheError(taskMessage.getTaskId(), error);
                    log.error("AI task failed after retries exhausted taskId={}, jobId={}",
                            taskMessage.getTaskId(), job.getId(), exception);
                } else {
                    markRetrying(job, lease, error);
                    cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.RETRYING);
                    log.warn("AI task attempt failed and will retry taskId={}, jobId={}, retryCount={}",
                            taskMessage.getTaskId(), job.getId(), currentRetryCount(), exception);
                }
                throw exception;
            }
            guard.assertOwned();
            terminalCoordinator.recordSuccess(job, lease, taskMessage, durableResult);
            cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.SUCCEEDED);
            cacheService.cacheResult(taskMessage.getTaskId(), durableResult.output());
            log.info("AI task succeeded taskId={}, jobId={}", taskMessage.getTaskId(), job.getId());
        }
    }

    private void validateTask(TaskMessageDTO taskMessage) {
        if (taskMessage == null || taskMessage.getTaskId() == null || taskMessage.getNodeType() == null
                || taskMessage.getNodeId() == null || taskMessage.getNodeId().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "invalid ai task message");
        }
    }

    private void markRetrying(AiJob job, AiJobLease lease, String error) {
        String outputJson = writeJson(Map.of("error", error));
        int updated = aiJobMapper.markAiJobRetryingWithLease(
                job.getId(), lease.token(), outputJson);
        if (updated != 1) {
            throw new BusinessException(ResultCode.CONFLICT,
                    "ai job lease ownership lost before retry transition");
        }
        job.setOutputJson(outputJson);
        job.setStatus(AiTaskStatus.RETRYING);
        job.setCompletedAt(null);
        job.setUpdatedAt(LocalDateTime.now());
        job.setLeaseToken(null);
        job.setLeaseExpiresAt(null);
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
        if (exception instanceof com.aetherflow.ai.file.ArtifactRegistrationException
                && exception.getCause() instanceof RuntimeException cause) {
            return safeError(cause);
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
