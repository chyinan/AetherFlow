package com.aetherflow.workflow.runtime.api;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

public record RuntimeEvent(
        String eventId,
        RuntimeEventType eventType,
        String workflowId,
        String traceId,
        String taskId,
        String nodeId,
        RuntimeState runtimeState,
        Instant occurredAt,
        Map<String, Object> attributes
) {

    public RuntimeEvent {
        if (eventId == null || eventId.isBlank()) {
            throw new IllegalArgumentException("eventId must not be blank");
        }
        Objects.requireNonNull(eventType, "eventType must not be null");
        if (workflowId == null || workflowId.isBlank()) {
            throw new IllegalArgumentException("workflowId must not be blank");
        }
        if (traceId == null || traceId.isBlank()) {
            throw new IllegalArgumentException("traceId must not be blank");
        }
        Objects.requireNonNull(runtimeState, "runtimeState must not be null");
        occurredAt = occurredAt == null ? Instant.now() : occurredAt;
        attributes = attributes == null ? Map.of() : Map.copyOf(attributes);
    }

    public static RuntimeEvent of(RuntimeEventType eventType,
                                  String workflowId,
                                  String traceId,
                                  String taskId,
                                  String nodeId,
                                  RuntimeState runtimeState,
                                  Instant occurredAt,
                                  Map<String, Object> attributes) {
        return new RuntimeEvent(UUID.randomUUID().toString(), eventType, workflowId, traceId, taskId,
                nodeId, runtimeState, occurredAt, attributes);
    }
}
