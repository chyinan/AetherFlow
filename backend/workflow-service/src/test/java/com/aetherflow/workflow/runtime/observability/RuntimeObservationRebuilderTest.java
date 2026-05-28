package com.aetherflow.workflow.runtime.observability;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class RuntimeObservationRebuilderTest {

    @Test
    void rebuildsObservationFromPersistedEventStream() {
        List<RuntimeEvent> events = List.of(
                event("event-1", RuntimeEventType.WORKFLOW_STARTED, RuntimeState.RUNNING,
                        null, Map.of("totalNodes", 2)),
                event("event-2", RuntimeEventType.NODE_COMPLETED, RuntimeState.RUNNING,
                        "node-a", Map.of()),
                event("event-3", RuntimeEventType.NODE_COMPLETED, RuntimeState.RUNNING,
                        "node-b", Map.of()),
                event("event-4", RuntimeEventType.WORKFLOW_COMPLETED, RuntimeState.SUCCESS,
                        "node-b", Map.of())
        );

        WorkflowRuntimeObservation observation = RuntimeObservationRebuilder
                .rebuild("workflow-1", events)
                .orElseThrow();

        assertThat(observation.workflowId()).isEqualTo("workflow-1");
        assertThat(observation.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(observation.currentNodeId()).isEqualTo("node-b");
        assertThat(observation.completedNodeCount()).isEqualTo(2);
        assertThat(observation.totalNodeCount()).isEqualTo(2);
        assertThat(observation.progress()).isEqualTo(1.0D);
    }

    private static RuntimeEvent event(String eventId,
                                      RuntimeEventType eventType,
                                      RuntimeState runtimeState,
                                      String nodeId,
                                      Map<String, Object> attributes) {
        return new RuntimeEvent(eventId, eventType, "workflow-1", "trace-1", "task-1", nodeId,
                runtimeState, Instant.parse("2026-05-28T12:00:00Z"), attributes);
    }
}
