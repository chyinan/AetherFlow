package com.aetherflow.workflow.node.metrics;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

@Component
public class WorkflowNodeMetrics {

    private final AtomicLong executionCount = new AtomicLong();
    private final AtomicLong retryCount = new AtomicLong();
    private final AtomicLong failCount = new AtomicLong();

    public void recordExecution(boolean retrying) {
        executionCount.incrementAndGet();
        if (retrying) {
            retryCount.incrementAndGet();
        }
    }

    public void recordFailure() {
        failCount.incrementAndGet();
    }

    public WorkflowNodeMetricsSnapshot snapshot() {
        return new WorkflowNodeMetricsSnapshot(
                executionCount.get(),
                retryCount.get(),
                failCount.get()
        );
    }
}
