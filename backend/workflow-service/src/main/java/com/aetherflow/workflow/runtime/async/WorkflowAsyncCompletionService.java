package com.aetherflow.workflow.runtime.async;

import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

// pattern: Imperative Shell
@Service
@RequiredArgsConstructor
public class WorkflowAsyncCompletionService {

    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowRuntimeEngine runtimeEngine;
    private final WorkflowRuntimeProperties runtimeProperties;
    private final WorkflowInstanceMapper instanceMapper;

    public WorkflowExecutionSnapshot completeSuccess(Long workflowInstanceId,
                                                      String nodeId,
                                                      Map<String, Object> output) {
        if (workflowInstanceId == null || workflowInstanceId <= 0) {
            throw new IllegalArgumentException("workflow instance id must be positive");
        }
        WorkflowRuntimeSnapshot stored = snapshotRepository.findByWorkflowId(String.valueOf(workflowInstanceId))
                .orElseThrow(() -> new IllegalStateException(
                        "workflow runtime snapshot not found: " + workflowInstanceId));
        if (stored.runtimeState() != RuntimeState.WAITING) {
            if (stored.runtimeState() == RuntimeState.SUCCESS
                    || stored.runtimeState() == RuntimeState.FAILED
                    || stored.runtimeState() == RuntimeState.CANCELLED) {
                return stored.toExecutionSnapshot();
            }
            throw new IllegalStateException("workflow is not ready for AI completion: "
                    + workflowInstanceId + " state=" + stored.runtimeState());
        }
        Map<String, Object> safeOutput = output == null ? Map.of() : Map.copyOf(output);
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                stored.workflowId(),
                stored.traceId(),
                stored.taskId(),
                stored.definition(),
                stored.variables(),
                runtimeProperties.getRetry().toRetryPolicy());
        WorkflowExecutionSnapshot completed = runtimeEngine.completeWaitingNode(
                request,
                stored.toExecutionSnapshot(),
                nodeId,
                NodeResult.success(safeOutput, safeOutput));
        snapshotRepository.save(WorkflowRuntimeSnapshot.fromExecution(
                stored.workflowId(), stored.traceId(), stored.taskId(), stored.definitionId(), stored.definition(),
                completed, completed.currentNodeIds(), completed.failedNodeIds()));
        updateInstance(workflowInstanceId, completed);
        return completed;
    }

    public WorkflowExecutionSnapshot completeFailure(Long workflowInstanceId,
                                                      String nodeId,
                                                      String error) {
        if (workflowInstanceId == null || workflowInstanceId <= 0) {
            throw new IllegalArgumentException("workflow instance id must be positive");
        }
        WorkflowRuntimeSnapshot stored = snapshotRepository.findByWorkflowId(String.valueOf(workflowInstanceId))
                .orElseThrow(() -> new IllegalStateException(
                        "workflow runtime snapshot not found: " + workflowInstanceId));
        if (stored.runtimeState() != RuntimeState.WAITING) {
            if (stored.runtimeState() == RuntimeState.SUCCESS
                    || stored.runtimeState() == RuntimeState.FAILED
                    || stored.runtimeState() == RuntimeState.CANCELLED) {
                return stored.toExecutionSnapshot();
            }
            throw new IllegalStateException("workflow is not ready for AI failure: "
                    + workflowInstanceId + " state=" + stored.runtimeState());
        }
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                stored.workflowId(), stored.traceId(), stored.taskId(), stored.definition(),
                stored.variables(), runtimeProperties.getRetry().toRetryPolicy());
        WorkflowExecutionSnapshot failed = runtimeEngine.failWaitingNode(
                request, stored.toExecutionSnapshot(), nodeId, error);
        snapshotRepository.save(WorkflowRuntimeSnapshot.fromExecution(
                stored.workflowId(), stored.traceId(), stored.taskId(), stored.definitionId(), stored.definition(),
                failed, failed.currentNodeIds(), failed.failedNodeIds()));
        updateInstance(workflowInstanceId, failed);
        return failed;
    }

    private void updateInstance(Long workflowInstanceId, WorkflowExecutionSnapshot snapshot) {
        WorkflowInstance update = new WorkflowInstance();
        update.setId(workflowInstanceId);
        update.setStatus(snapshot.runtimeState().name());
        update.setCurrentNodeId(snapshot.currentNodeId());
        update.setUpdatedAt(LocalDateTime.now());
        if (snapshot.runtimeState() == RuntimeState.SUCCESS
                || snapshot.runtimeState() == RuntimeState.FAILED
                || snapshot.runtimeState() == RuntimeState.CANCELLED) {
            update.setCompletedAt(LocalDateTime.now());
        }
        instanceMapper.updateById(update);
    }
}
