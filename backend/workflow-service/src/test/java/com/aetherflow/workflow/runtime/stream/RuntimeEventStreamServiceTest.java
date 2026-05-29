package com.aetherflow.workflow.runtime.stream;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RuntimeEventStreamServiceTest {

    @Test
    void returnsEventsAfterKnownCursor() {
        RuntimeEvent event1 = event("event-1", RuntimeEventType.WORKFLOW_STARTED);
        RuntimeEvent event2 = event("event-2", RuntimeEventType.NODE_STARTED);
        RuntimeEvent event3 = event("event-3", RuntimeEventType.NODE_COMPLETED);
        RuntimeEventStore store = mock(RuntimeEventStore.class);
        when(store.findByWorkflowId("workflow-1")).thenReturn(List.of(event1, event2, event3));

        RuntimeEventStreamService service = new RuntimeEventStreamService(store);

        assertThat(service.eventsAfterCursor("workflow-1", "event-1"))
                .extracting(RuntimeEvent::eventId)
                .containsExactly("event-2", "event-3");
    }

    @Test
    void replaysAllEventsWhenCursorIsMissing() {
        RuntimeEvent event1 = event("event-1", RuntimeEventType.WORKFLOW_STARTED);
        RuntimeEvent event2 = event("event-2", RuntimeEventType.NODE_STARTED);
        RuntimeEventStore store = mock(RuntimeEventStore.class);
        when(store.findByWorkflowId("workflow-1")).thenReturn(List.of(event1, event2));

        RuntimeEventStreamService service = new RuntimeEventStreamService(store);

        assertThat(service.eventsAfterCursor("workflow-1", "missing"))
                .extracting(RuntimeEvent::eventId)
                .containsExactly("event-1", "event-2");
    }

    @Test
    void cursorQueryParamTakesPrecedenceOverLastEventId() {
        RuntimeEventStreamService service = new RuntimeEventStreamService(RuntimeEventStore.noop());

        assertThat(service.effectiveCursor("header-cursor", "query-cursor")).isEqualTo("query-cursor");
        assertThat(service.effectiveCursor("header-cursor", " ")).isEqualTo("header-cursor");
    }

    @Test
    void heartbeatPayloadIncludesRecoveryCursor() {
        RuntimeEventStreamService service = new RuntimeEventStreamService(RuntimeEventStore.noop());

        Map<String, Object> payload = service.heartbeatPayload(
                "workflow-1",
                "event-9",
                Instant.parse("2026-05-29T09:30:00Z")
        );

        assertThat(payload).containsEntry("workflowId", "workflow-1")
                .containsEntry("cursor", "event-9")
                .containsEntry("occurredAt", "2026-05-29T09:30:00Z");
    }

    private static RuntimeEvent event(String eventId, RuntimeEventType eventType) {
        return new RuntimeEvent(
                eventId,
                eventType,
                "workflow-1",
                "trace-1",
                "task-1",
                eventType == RuntimeEventType.WORKFLOW_STARTED ? null : "node-a",
                RuntimeState.RUNNING,
                Instant.parse("2026-05-29T09:00:00Z"),
                Map.of()
        );
    }
}
