package com.aetherflow.common.core;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class MqEventTest {

    @Test
    void factoryCreatesTraceableEventEnvelope() {
        MqEvent<Map<String, Object>> event = MqEvent.of(
                "AI_TASK_CREATED",
                "task-service",
                "task-1",
                "trace-1",
                Map.of("taskId", 1L)
        );

        assertThat(event.getEventId()).isNotBlank();
        assertThat(event.getEventType()).isEqualTo("AI_TASK_CREATED");
        assertThat(event.getSourceService()).isEqualTo("task-service");
        assertThat(event.getAggregateId()).isEqualTo("task-1");
        assertThat(event.getTraceId()).isEqualTo("trace-1");
        assertThat(event.getOccurredAt()).isNotNull();
        assertThat(event.getPayload()).containsEntry("taskId", 1L);
    }
}
