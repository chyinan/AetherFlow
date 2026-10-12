package com.aetherflow.workflow.runtime.cancellation;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowRuntimeSnapshotMapper;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.notification.WorkflowTerminalNotificationOutboxService;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/** 直接取消和子流程回收共用的幂等取消流程；失败由调用方保留收据并重试。 */
@Service
public class WorkflowCancellationService {
    private final WorkflowInstanceMapper instances;
    private final WorkflowRuntimeSnapshotMapper snapshotMapper;
    private final RuntimeSnapshotRepository snapshots;
    private final TaskClient tasks;
    private final TaskClientProperties taskProperties;
    private final WorkflowTerminalNotificationOutboxService notifications;

    public WorkflowCancellationService(WorkflowInstanceMapper instances,
                                       WorkflowRuntimeSnapshotMapper snapshotMapper,
                                       RuntimeSnapshotRepository snapshots,
                                       TaskClient tasks,
                                       TaskClientProperties taskProperties,
                                       WorkflowTerminalNotificationOutboxService notifications) {
        this.instances = instances;
        this.snapshotMapper = snapshotMapper;
        this.snapshots = snapshots;
        this.tasks = tasks;
        this.taskProperties = taskProperties;
        this.notifications = notifications;
    }

    /** 返回 false 表示运行已成功或失败，调用方不得把它改成取消。 */
    public boolean cancel(Long instanceId, Long userId) {
        WorkflowInstance instance = requireInstance(instanceId);
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
        // 已取消实例也必须重放清理；不能因上轮实例更新成功而跳过失败的任务请求。
        snapshotMapper.markCancelled(String.valueOf(instanceId));
        Result<Integer> result = tasks.cancelWorkflowTasks(taskProperties.issueInternalToken(), instanceId);
        if (result == null || !result.isSuccess() || result.getData() == null || result.getData() < 0) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "工作流已取消，任务清理尚未确认，请重试");
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
