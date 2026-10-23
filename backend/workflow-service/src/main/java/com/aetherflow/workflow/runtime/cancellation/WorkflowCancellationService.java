package com.aetherflow.workflow.runtime.cancellation;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowRuntimeSnapshotMapper;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.notification.WorkflowTerminalNotificationOutboxService;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Objects;

/** Commits cancellation state and durable cleanup work together; task cleanup runs after commit. */
@Service
public class WorkflowCancellationService {
    private final WorkflowInstanceMapper instances;
    private final WorkflowRuntimeSnapshotMapper snapshotMapper;
    private final RuntimeSnapshotRepository snapshots;
    private final WorkflowCancellationCleanupMapper cleanupMapper;
    private final WorkflowTerminalNotificationOutboxService notifications;

    public WorkflowCancellationService(WorkflowInstanceMapper instances,
                                       WorkflowRuntimeSnapshotMapper snapshotMapper,
                                       RuntimeSnapshotRepository snapshots,
                                       WorkflowCancellationCleanupMapper cleanupMapper,
                                       WorkflowTerminalNotificationOutboxService notifications) {
        this.instances = instances;
        this.snapshotMapper = snapshotMapper;
        this.snapshots = snapshots;
        this.cleanupMapper = cleanupMapper;
        this.notifications = notifications;
    }

    /** 返回 false 表示运行已成功或失败，调用方不得把它改成取消。 */
    @Transactional(rollbackFor = Exception.class)
    public boolean cancel(Long instanceId, Long userId) {
        WorkflowInstance instance = requireInstance(instanceId);
        if (userId == null || userId <= 0) throw new BusinessException(ResultCode.UNAUTHORIZED, "authenticated user is required");
        if (!Objects.equals(instance.getUserId(), userId)) throw new BusinessException(ResultCode.FORBIDDEN, "workflow instance does not belong to user");
        if (completed(instance.getStatus())) return false;
        if (!"CANCELLED".equals(instance.getStatus())) {
            if (completedSnapshot(instanceId)) return false;
            // SQL 原子取消实例及现有快照，并再次检查终态，避免两次写入之间覆盖成功结果。
            if (instances.cancelIfActive(instanceId, userId, LocalDateTime.now()) == 0) {
                instance = requireInstance(instanceId);
                if (!"CANCELLED".equals(instance.getStatus())) {
                    if (completed(instance.getStatus()) || completedSnapshot(instanceId)) return false;
                    throw new IllegalStateException("工作流取消状态尚未确认，需要重试");
                }
            }
        }
        // 运行状态、取消清理收据和终态通知在同一数据库事务内提交。
        snapshotMapper.markCancelled(String.valueOf(instanceId));
        LocalDateTime now = LocalDateTime.now();
        cleanupMapper.ensurePending(instanceId, userId, now);
        if (cleanupMapper.findByWorkflowInstanceId(instanceId) == null) {
            throw new IllegalStateException("工作流已取消，但取消清理收据未能持久化");
        }
        notifications.enqueue(instanceId, userId, null, RuntimeState.CANCELLED, null);
        return true;
    }

    private WorkflowInstance requireInstance(Long instanceId) {
        WorkflowInstance instance = instances.selectById(instanceId);
        if (instance == null) throw new BusinessException(ResultCode.NOT_FOUND, "workflow instance not found");
        return instance;
    }

    private boolean completedSnapshot(Long instanceId) {
        return snapshots.findByWorkflowId(String.valueOf(instanceId))
                .map(snapshot -> completed(snapshot.runtimeState().name())).orElse(false);
    }

    private boolean completed(String state) {
        return "SUCCESS".equals(state) || "FAILED".equals(state);
    }
}
