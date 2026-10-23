package com.aetherflow.workflow.runtime.cancellation;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Retries task cleanup independently from the terminal workflow state. */
@Slf4j
@Service
public class WorkflowCancellationCleanupService {
    private static final int BATCH_SIZE = 100;
    private static final Duration STALE_LEASE = Duration.ofMinutes(5);

    private final WorkflowCancellationCleanupMapper cleanups;
    private final WorkflowInstanceMapper instances;
    private final TaskClient tasks;
    private final TaskClientProperties taskProperties;

    @Value("${aetherflow.workflow.cancellation-cleanup.retention:30d}")
    private Duration retention = Duration.ofDays(30);

    public WorkflowCancellationCleanupService(WorkflowCancellationCleanupMapper cleanups,
                                              WorkflowInstanceMapper instances,
                                              TaskClient tasks,
                                              TaskClientProperties taskProperties) {
        this.cleanups = cleanups;
        this.instances = instances;
        this.tasks = tasks;
        this.taskProperties = taskProperties;
    }

    public WorkflowCancellationCleanupStatus status(Long workflowInstanceId, Long userId) {
        WorkflowInstance instance = requireOwnedInstance(workflowInstanceId, userId);
        WorkflowCancellationCleanup cleanup = cleanups.findByWorkflowInstanceId(workflowInstanceId);
        if (cleanup == null) {
            return new WorkflowCancellationCleanupStatus(workflowInstanceId,
                    "CANCELLED".equals(instance.getStatus()) ? WorkflowCancellationCleanup.COMPLETE : WorkflowCancellationCleanup.NOT_REQUIRED,
                    0, null, null, null, false);
        }
        return response(cleanup);
    }

    /** A user retry only moves the existing durable row forward; it never changes run state. */
    public WorkflowCancellationCleanupStatus retry(Long workflowInstanceId, Long userId) {
        WorkflowInstance instance = requireOwnedInstance(workflowInstanceId, userId);
        if (!"CANCELLED".equals(instance.getStatus())) {
            throw new BusinessException(ResultCode.CONFLICT, "只有已取消的工作流运行可以重试任务清理");
        }
        LocalDateTime now = LocalDateTime.now();
        cleanups.ensurePending(workflowInstanceId, userId, now);
        WorkflowCancellationCleanup cleanup = cleanups.findByWorkflowInstanceId(workflowInstanceId);
        if (cleanup == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "取消清理记录尚未持久化，请重试");
        }
        if (WorkflowCancellationCleanup.PENDING.equals(cleanup.getStatus())) {
            cleanups.retryNow(cleanup.getId(), now);
            dispatchInstance(workflowInstanceId);
        }
        return status(workflowInstanceId, userId);
    }

    /** Runs immediately after the cancellation transaction commits. */
    public void dispatchInstance(Long workflowInstanceId) {
        WorkflowCancellationCleanup cleanup = cleanups.findByWorkflowInstanceId(workflowInstanceId);
        if (cleanup != null) dispatch(cleanup);
    }

    @Scheduled(fixedDelayString = "${aetherflow.workflow.cancellation-cleanup.fixed-delay:5000}")
    public int dispatchDue() {
        LocalDateTime now = LocalDateTime.now();
        List<WorkflowCancellationCleanup> due = cleanups.selectDue(now, now.minus(STALE_LEASE), BATCH_SIZE);
        if (due == null || due.isEmpty()) return 0;
        int completed = 0;
        for (WorkflowCancellationCleanup cleanup : due) {
            if (cleanup != null && dispatch(cleanup)) completed++;
        }
        return completed;
    }

    @Scheduled(fixedDelayString = "${aetherflow.workflow.cancellation-cleanup.retention-fixed-delay:3600000}")
    public int purgeCompleted() {
        Duration effectiveRetention = retention == null || retention.isNegative() ? Duration.ofDays(30) : retention;
        return cleanups.deleteTerminalBefore(LocalDateTime.now().minus(effectiveRetention), 1000);
    }

    private boolean dispatch(WorkflowCancellationCleanup cleanup) {
        LocalDateTime now = LocalDateTime.now();
        String leaseToken = UUID.randomUUID().toString();
        int attempt = Math.max(1, (cleanup.getAttemptCount() == null ? 0 : cleanup.getAttemptCount()) + 1);
        if (cleanups.claim(cleanup.getId(), leaseToken, now, now.minus(STALE_LEASE)) != 1) return false;
        try {
            Result<Integer> result = tasks.cancelWorkflowTasks(taskProperties.issueInternalToken(), cleanup.getWorkflowInstanceId());
            if (result == null || !result.isSuccess() || result.getData() == null || result.getData() < 0) {
                throw new IllegalStateException(result == null
                        ? "Task Service did not return a cleanup result"
                        : result.getMessage() == null || result.getMessage().isBlank()
                            ? "Task Service did not confirm cancellation cleanup" : result.getMessage());
            }
            if (cleanups.markComplete(cleanup.getId(), leaseToken, LocalDateTime.now()) != 1) {
                log.warn("workflow cancellation cleanup lease ownership lost, workflowInstanceId={}", cleanup.getWorkflowInstanceId());
                return false;
            }
            return true;
        } catch (RuntimeException exception) {
            LocalDateTime failedAt = LocalDateTime.now();
            LocalDateTime nextAttemptAt = failedAt.plusSeconds(retryDelaySeconds(attempt));
            cleanups.markRetry(cleanup.getId(), leaseToken, nextAttemptAt, truncate(exception.getMessage()), failedAt);
            log.warn("workflow cancellation cleanup failed, workflowInstanceId={}, attempt={}",
                    cleanup.getWorkflowInstanceId(), attempt, exception);
            return false;
        }
    }

    private WorkflowInstance requireOwnedInstance(Long workflowInstanceId, Long userId) {
        if (workflowInstanceId == null || workflowInstanceId <= 0 || userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "authenticated workflow owner is required");
        }
        WorkflowInstance instance = instances.selectById(workflowInstanceId);
        if (instance == null) throw new BusinessException(ResultCode.NOT_FOUND, "workflow instance not found");
        if (!userId.equals(instance.getUserId())) throw new BusinessException(ResultCode.FORBIDDEN, "workflow instance does not belong to user");
        return instance;
    }

    private WorkflowCancellationCleanupStatus response(WorkflowCancellationCleanup cleanup) {
        String status = cleanup.getStatus();
        if (WorkflowCancellationCleanup.PENDING.equals(status) && cleanup.getLastError() != null) status = "FAILED";
        boolean retryable = WorkflowCancellationCleanup.PENDING.equals(cleanup.getStatus());
        return new WorkflowCancellationCleanupStatus(cleanup.getWorkflowInstanceId(), status,
                cleanup.getAttemptCount() == null ? 0 : cleanup.getAttemptCount(), cleanup.getLastError(),
                cleanup.getNextAttemptAt(), cleanup.getCompletedAt(), retryable);
    }

    private long retryDelaySeconds(int attempt) {
        long exponent = Math.min(Math.max(0, attempt - 1), 5);
        return Math.min(300, 10L << exponent);
    }

    private String truncate(String error) {
        String text = error == null || error.isBlank() ? "Task Service cleanup request failed" : error;
        return text.length() <= 1000 ? text : text.substring(0, 1000);
    }
}
