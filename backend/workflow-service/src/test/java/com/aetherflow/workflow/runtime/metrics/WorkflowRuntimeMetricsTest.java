package com.aetherflow.workflow.runtime.metrics;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowRuntimeMetricsTest {

    @Test
    void aggregatesWorkflowNodeRetryAndFailureCounters() {
        WorkflowRuntimeMetrics metrics = new WorkflowRuntimeMetrics(Instant.parse("2026-05-28T09:00:00Z"));

        metrics.publish(event(RuntimeEventType.WORKFLOW_STARTED, RuntimeState.RUNNING, null));
        metrics.publish(event(RuntimeEventType.NODE_COMPLETED, RuntimeState.RUNNING, "node-a"));
        metrics.publish(event(RuntimeEventType.NODE_RETRYING, RuntimeState.RETRYING, "node-b"));
        metrics.publish(event(RuntimeEventType.WORKFLOW_FAILED, RuntimeState.FAILED, "node-b"));

        RuntimeMetricsSnapshot snapshot = metrics.snapshot(Instant.parse("2026-05-28T09:00:10Z"));
        assertThat(snapshot.currentWorkflowCount()).isZero();
        assertThat(snapshot.nodeTps()).isEqualTo(0.1D);
        assertThat(snapshot.retryCount()).isEqualTo(1L);
        assertThat(snapshot.failCount()).isEqualTo(1L);
    }

    private static RuntimeEvent event(RuntimeEventType eventType, RuntimeState state, String nodeId) {
        return RuntimeEvent.of(eventType, "workflow-1", "trace-1", "task-1", nodeId, state,
                Instant.parse("2026-05-28T09:00:00Z"), Map.of());
    }
}
