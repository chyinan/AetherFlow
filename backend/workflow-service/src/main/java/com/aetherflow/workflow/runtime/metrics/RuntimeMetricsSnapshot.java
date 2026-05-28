package com.aetherflow.workflow.runtime.metrics;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Runtime metrics snapshot for workflow execution monitoring.")
public record RuntimeMetricsSnapshot(
        @Schema(description = "Current running workflow count.", example = "3")
        long currentWorkflowCount,

        @Schema(description = "Node executions per second.", example = "12.5")
        double nodeTps,

        @Schema(description = "Runtime retry count.", example = "2")
        long retryCount,

        @Schema(description = "Runtime failure count.", example = "1")
        long failCount
) {
}
