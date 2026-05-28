package com.aetherflow.workflow.node.metrics;

public record WorkflowNodeMetricsSnapshot(
        long executionCount,
        long retryCount,
        long failCount
) {
}
