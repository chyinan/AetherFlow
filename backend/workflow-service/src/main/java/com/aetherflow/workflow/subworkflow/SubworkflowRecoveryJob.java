package com.aetherflow.workflow.subworkflow;

import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.cancellation.WorkflowCancellationService;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;

/** 调用关系本身是可重放的完成收据；服务重启或丢失回调后仍可推进父流程。 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SubworkflowRecoveryJob {
    private final WorkflowChildRunMapper mapper;
    private final WorkflowInstanceMapper instances;
    private final RuntimeSnapshotRepository snapshots;
    private final SubworkflowService subworkflows;
    private final WorkflowRuntimeEngine engine;
    private final WorkflowRuntimeProperties properties;
    private final WorkflowCancellationService cancellations;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.aetherflow.workflow.runtime.notification.WorkflowTerminalNotificationOutboxService terminalNotifications;

    @Scheduled(fixedDelayString = "${aetherflow.workflow.subworkflow.reconcile-interval:3000}")
    public int reconcile() {
        int completed = 0;
        for (WorkflowChildRun run : mapper.due(LocalDateTime.now(), 100)) {
            String status = "WAITING";
            try {
                if (reconcile(run)) { status = "COMPLETED"; completed++; }
            } catch (RuntimeException exception) {
                log.warn("子流程完成收据等待重试，childInstanceId={}, reason={}", run.getChildInstanceId(), exception.getMessage());
            } finally {
                LocalDateTime now = LocalDateTime.now();
                mapper.recordAttempt(run.getId(), status, now, now.plusSeconds(3));
            }
        }
        return completed;
    }

    private boolean reconcile(WorkflowChildRun run) {
        WorkflowInstance parent = instances.selectById(run.getParentInstanceId());
        WorkflowRuntimeSnapshot parentSnapshot = snapshots.findByWorkflowId(String.valueOf(run.getParentInstanceId())).orElse(null);
        if (parent == null || SubworkflowService.terminal(parent.getStatus())
                || (parentSnapshot != null && SubworkflowService.terminal(parentSnapshot.runtimeState().name()))) {
            // 子快照可能已成功而实例投影尚未刷回；不能把已完成子运行误写成取消。
            boolean parentSucceeded = parent != null && "SUCCESS".equals(parent.getStatus())
                    || parentSnapshot != null && parentSnapshot.runtimeState() == RuntimeState.SUCCESS;
            if (!parentSucceeded) {
                // 只有快照和活动任务都清理成功才结束收据；失败继续使用 WAITING 收据重试。
                cancellations.cancel(run.getChildInstanceId(), run.getOwnerUserId());
            }
            return true;
        }
        if (parentSnapshot == null) return false;
        NodeResult prior = parentSnapshot.nodeOutputs().get(run.getParentNodeId());
        if (prior != null && !prior.waiting()) return true;
        // 父节点可能仍在运行并写入 WAITING；此时不抢先提交子结果。
        if (parentSnapshot.runtimeState() != RuntimeState.WAITING || prior == null || !prior.waiting()) return false;
        return AuthenticatedUserContext.runAs(run.getOwnerUserId(), "aether.operator", () -> {
            NodeResult result;
            try { result = subworkflows.result(run); }
            catch (SubworkflowResultException failedChild) {
                WorkflowExecutionSnapshot failed = engine.failWaitingNode(String.valueOf(run.getParentInstanceId()),
                        run.getParentNodeId(), failedChild.getMessage(), properties.getRetry().toRetryPolicy());
                project(run.getParentInstanceId(), failed);
                return true;
            }
            if (result.waiting()) return false;
            WorkflowExecutionSnapshot resumed = engine.completeWaitingNode(String.valueOf(run.getParentInstanceId()),
                    run.getParentNodeId(), stored -> result, properties.getRetry().toRetryPolicy());
            project(run.getParentInstanceId(), resumed);
            return true;
        });
    }

    private void project(Long instanceId, WorkflowExecutionSnapshot snapshot) {
        LocalDateTime now = LocalDateTime.now();
        boolean terminal = SubworkflowService.terminal(snapshot.runtimeState().name());
        int transitioned = instances.transitionRuntimeState(instanceId, snapshot.runtimeState().name(), snapshot.currentNodeId(),
                terminal ? now : null, now);
        if (transitioned == 1 && terminal && terminalNotifications != null) {
            try {
                terminalNotifications.enqueue(instanceId, AuthenticatedUserContext.requireUserId(), snapshot.traceId(),
                        snapshot.runtimeState(), snapshot.currentNodeId());
            } catch (RuntimeException exception) {
                // 终态快照已持久化，通知扫描器会补投，不回滚成功完成的父流程。
                log.warn("子流程恢复后的终态通知等待补投，instanceId={}", instanceId, exception);
            }
        }
    }
}
