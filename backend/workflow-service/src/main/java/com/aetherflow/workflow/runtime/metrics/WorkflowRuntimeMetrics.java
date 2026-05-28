package com.aetherflow.workflow.runtime.metrics;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

public class WorkflowRuntimeMetrics implements RuntimeEventPublisher {

    private final Instant startedAt;
    private final AtomicLong currentWorkflowCount = new AtomicLong();
    private final AtomicLong nodeCompletedCount = new AtomicLong();
    private final AtomicLong retryCount = new AtomicLong();
    private final AtomicLong failCount = new AtomicLong();

    public WorkflowRuntimeMetrics() {
        this(Instant.now());
    }

    public WorkflowRuntimeMetrics(Instant startedAt) {
        this.startedAt = startedAt == null ? Instant.now() : startedAt;
    }

    @Override
    public void publish(RuntimeEvent event) {
        if (event == null) {
            return;
        }
        RuntimeEventType eventType = event.eventType();
        if (eventType == RuntimeEventType.WORKFLOW_STARTED) {
            currentWorkflowCount.incrementAndGet();
        } else if (eventType == RuntimeEventType.NODE_COMPLETED) {
            nodeCompletedCount.incrementAndGet();
        } else if (eventType == RuntimeEventType.NODE_RETRYING) {
            retryCount.incrementAndGet();
        } else if (eventType == RuntimeEventType.WORKFLOW_FAILED) {
            failCount.incrementAndGet();
            decrementCurrentWorkflowCount();
        } else if (eventType == RuntimeEventType.WORKFLOW_COMPLETED
                || eventType == RuntimeEventType.WORKFLOW_CANCELLED) {
            decrementCurrentWorkflowCount();
        }
    }

    public RuntimeMetricsSnapshot snapshot() {
        return snapshot(Instant.now());
    }

    public RuntimeMetricsSnapshot snapshot(Instant now) {
        Instant snapshotTime = now == null ? Instant.now() : now;
        long elapsedSeconds = Math.max(1L, Duration.between(startedAt, snapshotTime).getSeconds());
        double nodeTps = nodeCompletedCount.get() / (double) elapsedSeconds;
        return new RuntimeMetricsSnapshot(
                currentWorkflowCount.get(),
                nodeTps,
                retryCount.get(),
                failCount.get()
        );
    }

    private void decrementCurrentWorkflowCount() {
        currentWorkflowCount.updateAndGet(current -> current <= 0 ? 0 : current - 1);
    }
}
