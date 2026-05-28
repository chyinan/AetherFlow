package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;

import java.util.List;
import java.util.Map;

public record WorkflowExecutionSnapshot(
        String workflowId,
        String traceId,
        String taskId,
        RuntimeState runtimeState,
        String currentNodeId,
        List<String> currentNodeIds,
        Map<String, Object> variables,
        Map<String, NodeResult> nodeOutputs,
        List<String> completedNodeIds,
        List<String> failedNodeIds
) {

    public WorkflowExecutionSnapshot {
        currentNodeIds = currentNodeIds == null ? List.of() : List.copyOf(currentNodeIds);
        variables = variables == null ? Map.of() : Map.copyOf(variables);
        nodeOutputs = nodeOutputs == null ? Map.of() : Map.copyOf(nodeOutputs);
        completedNodeIds = completedNodeIds == null ? List.of() : List.copyOf(completedNodeIds);
        failedNodeIds = failedNodeIds == null ? List.of() : List.copyOf(failedNodeIds);
    }

    public WorkflowExecutionSnapshot(String workflowId,
                                     String traceId,
                                     String taskId,
                                     RuntimeState runtimeState,
                                     String currentNodeId,
                                     Map<String, Object> variables,
                                     Map<String, NodeResult> nodeOutputs,
                                     List<String> completedNodeIds) {
        this(
                workflowId,
                traceId,
                taskId,
                runtimeState,
                currentNodeId,
                currentNodeId == null || currentNodeId.isBlank() ? List.of() : List.of(currentNodeId),
                variables,
                nodeOutputs,
                completedNodeIds,
                List.of()
        );
    }
}
