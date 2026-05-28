package com.aetherflow.workflow.runtime.api;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RuntimeEventTest {

    @Test
    void createsReadOnlyRuntimeEventPayload() {
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("nodeType", "SUMMARY");

        RuntimeEvent event = RuntimeEvent.of(
                RuntimeEventType.NODE_STARTED,
                "workflow-1",
                "trace-1",
                "task-1",
                "node-1",
                RuntimeState.RUNNING,
                Instant.parse("2026-05-28T09:00:00Z"),
                attributes
        );
        attributes.put("nodeType", "EXPORT");

        assertThat(event.eventId()).isNotBlank();
        assertThat(event.attributes()).containsEntry("nodeType", "SUMMARY");
        assertThatThrownBy(() -> event.attributes().put("x", true))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
