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
        Map<String, Object> variables,
        Map<String, NodeResult> nodeOutputs,
        List<String> completedNodeIds
) {

    public WorkflowExecutionSnapshot {
        variables = variables == null ? Map.of() : Map.copyOf(variables);
        nodeOutputs = nodeOutputs == null ? Map.of() : Map.copyOf(nodeOutputs);
        completedNodeIds = completedNodeIds == null ? List.of() : List.copyOf(completedNodeIds);
    }
}
