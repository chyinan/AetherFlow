package com.aetherflow.workflow.runtime.observability;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryRuntimeObservationStoreTest {

    @Test
    void buildsObservationSnapshotFromRuntimeEvents() {
        InMemoryRuntimeObservationStore store = new InMemoryRuntimeObservationStore(50);

        store.publish(event(RuntimeEventType.WORKFLOW_STARTED, RuntimeState.RUNNING, null, Map.of("totalNodes", 2)));
        store.publish(event(RuntimeEventType.NODE_STARTED, RuntimeState.RUNNING, "node-a", Map.of()));
        store.publish(event(RuntimeEventType.NODE_COMPLETED, RuntimeState.RUNNING, "node-a", Map.of()));
        store.publish(event(RuntimeEventType.WORKFLOW_COMPLETED, RuntimeState.SUCCESS, "node-a", Map.of()));

        WorkflowRuntimeObservation observation = store.snapshot("workflow-1").orElseThrow();
        List<RuntimeEvent> events = store.events("workflow-1");

        assertThat(observation.workflowId()).isEqualTo("workflow-1");
        assertThat(observation.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(observation.currentNodeId()).isEqualTo("node-a");
        assertThat(observation.completedNodeCount()).isEqualTo(1);
        assertThat(observation.totalNodeCount()).isEqualTo(2);
        assertThat(observation.progress()).isEqualTo(1.0D);
        assertThat(events).hasSize(4);
    }

    private static RuntimeEvent event(RuntimeEventType eventType,
                                      RuntimeState state,
                                      String nodeId,
                                      Map<String, Object> attributes) {
        return RuntimeEvent.of(eventType, "workflow-1", "trace-1", "task-1", nodeId, state,
                Instant.parse("2026-05-28T09:00:00Z"), attributes);
    }
}
