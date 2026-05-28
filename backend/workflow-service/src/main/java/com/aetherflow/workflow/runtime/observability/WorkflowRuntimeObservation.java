package com.aetherflow.workflow.runtime.observability;

import com.aetherflow.workflow.runtime.api.RuntimeState;

public record WorkflowRuntimeObservation(
        String workflowId,
        String traceId,
        String taskId,
        RuntimeState runtimeState,
        String currentNodeId,
        int completedNodeCount,
        int totalNodeCount,
        double progress
) {
}
