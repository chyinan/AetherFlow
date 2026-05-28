package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PersistentRuntimeEventPublisherTest {

    @Test
    void appendsRuntimeEventToStore() {
        RecordingRuntimeEventStore store = new RecordingRuntimeEventStore();
        PersistentRuntimeEventPublisher publisher = new PersistentRuntimeEventPublisher(store);
        RuntimeEvent event = event("event-1", RuntimeEventType.WORKFLOW_STARTED, null, Map.of("totalNodes", 2));

        publisher.publish(event);

        assertThat(store.findByWorkflowId("workflow-1")).containsExactly(event);
    }

    private static RuntimeEvent event(String eventId,
                                      RuntimeEventType eventType,
                                      String nodeId,
                                      Map<String, Object> attributes) {
        return new RuntimeEvent(eventId, eventType, "workflow-1", "trace-1", "task-1", nodeId,
                RuntimeState.RUNNING, Instant.parse("2026-05-28T12:00:00Z"), attributes);
    }

    private static final class RecordingRuntimeEventStore implements RuntimeEventStore {

        private final List<RuntimeEvent> events = new ArrayList<>();

        @Override
        public void append(RuntimeEvent event) {
            events.add(event);
        }

        @Override
        public List<RuntimeEvent> findByWorkflowId(String workflowId) {
            return events.stream()
                    .filter(event -> event.workflowId().equals(workflowId))
                    .toList();
        }
    }
}
