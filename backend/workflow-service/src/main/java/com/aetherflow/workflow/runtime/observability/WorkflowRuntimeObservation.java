package com.aetherflow.workflow.runtime.observability;

import com.aetherflow.workflow.runtime.api.RuntimeState;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Workflow runtime observation snapshot for frontend run detail pages.")
public record WorkflowRuntimeObservation(
        @Schema(description = "Workflow instance id.", example = "workflow-1001")
        String workflowId,

        @Schema(description = "Trace id for logs and runtime events.", example = "trace-abc123")
        String traceId,

        @Schema(description = "Task id that triggered the workflow.", example = "task-1001")
        String taskId,

        @Schema(description = "Current runtime state.", example = "RUNNING")
        RuntimeState runtimeState,

        @Schema(description = "Current node id.", example = "node-summary-1")
        String currentNodeId,

        @Schema(description = "Completed node count.", example = "3")
        int completedNodeCount,

        @Schema(description = "Total node count.", example = "5")
        int totalNodeCount,

        @Schema(description = "Execution progress from 0 to 1.", example = "0.6")
        double progress
) {
}
