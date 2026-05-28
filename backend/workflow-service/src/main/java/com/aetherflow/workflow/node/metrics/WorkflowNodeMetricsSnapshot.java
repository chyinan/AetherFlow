package com.aetherflow.workflow.node.metrics;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Workflow node executor metrics snapshot.")
public record WorkflowNodeMetricsSnapshot(
        @Schema(description = "Total node execution count.", example = "128")
        long executionCount,

        @Schema(description = "Execution count while runtime is retrying.", example = "3")
        long retryCount,

        @Schema(description = "Node execution failure count.", example = "1")
        long failCount
) {
}
