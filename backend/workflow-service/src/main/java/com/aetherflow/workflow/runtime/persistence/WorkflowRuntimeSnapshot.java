package com.aetherflow.workflow.runtime.persistence;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public record WorkflowRuntimeSnapshot(
        String workflowId,
        String traceId,
        String taskId,
        Long definitionId,
        WorkflowDefinitionDTO definition,
        RuntimeState runtimeState,
        List<String> currentNodeIds,
        List<String> completedNodeIds,
        List<String> failedNodeIds,
        Map<String, Object> variables,
        Map<String, NodeResult> nodeOutputs,
        Instant updatedAt
) {

    public WorkflowRuntimeSnapshot {
        workflowId = requireText(workflowId, "workflowId");
        traceId = requireText(traceId, "traceId");
        taskId = requireText(taskId, "taskId");
        Objects.requireNonNull(definition, "definition must not be null");
        Objects.requireNonNull(runtimeState, "runtimeState must not be null");
        currentNodeIds = currentNodeIds == null ? List.of() : List.copyOf(currentNodeIds);
        completedNodeIds = completedNodeIds == null ? List.of() : List.copyOf(completedNodeIds);
        failedNodeIds = failedNodeIds == null ? List.of() : List.copyOf(failedNodeIds);
        variables = variables == null ? Map.of() : Map.copyOf(variables);
        nodeOutputs = nodeOutputs == null ? Map.of() : Map.copyOf(nodeOutputs);
        updatedAt = updatedAt == null ? Instant.now() : updatedAt;
    }

    public static WorkflowRuntimeSnapshot fromExecution(String workflowId,
                                                        String traceId,
                                                        String taskId,
                                                        Long definitionId,
                                                        WorkflowDefinitionDTO definition,
                                                        WorkflowExecutionSnapshot executionSnapshot,
                                                        List<String> currentNodeIds,
                                                        List<String> failedNodeIds) {
        return new WorkflowRuntimeSnapshot(
                workflowId,
                traceId,
                taskId,
                definitionId,
                definition,
                executionSnapshot.runtimeState(),
                currentNodeIds,
                executionSnapshot.completedNodeIds(),
                failedNodeIds,
                executionSnapshot.variables(),
                executionSnapshot.nodeOutputs(),
                Instant.now()
        );
    }

    public WorkflowExecutionSnapshot toExecutionSnapshot() {
        String currentNodeId = currentNodeIds.isEmpty() ? null : currentNodeIds.get(currentNodeIds.size() - 1);
        return new WorkflowExecutionSnapshot(
                workflowId,
                traceId,
                taskId,
                runtimeState,
                currentNodeId,
                currentNodeIds,
                variables,
                nodeOutputs,
                completedNodeIds,
                failedNodeIds
        );
    }

    public boolean recoverable() {
        return runtimeState == RuntimeState.RUNNING || runtimeState == RuntimeState.RETRYING;
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " must not be blank");
        }
        return value;
    }
}
