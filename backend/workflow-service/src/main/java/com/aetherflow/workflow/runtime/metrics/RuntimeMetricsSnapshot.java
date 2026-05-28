package com.aetherflow.workflow.runtime.metrics;

public record RuntimeMetricsSnapshot(
        long currentWorkflowCount,
        double nodeTps,
        long retryCount,
        long failCount
) {
}
