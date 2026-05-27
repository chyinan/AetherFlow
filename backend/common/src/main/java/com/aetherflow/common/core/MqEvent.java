package com.aetherflow.common.core;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Traceable MQ event envelope.")
public class MqEvent<T> implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Schema(description = "Unique event id.", example = "d1c51f9b-87f1-4599-9b23-e6a09f8d2c9d")
    private String eventId;

    @Schema(description = "Event type.", example = "AI_TASK_CREATED")
    private String eventType;

    @Schema(description = "Service that produced the event.", example = "task-service")
    private String sourceService;

    @Schema(description = "Business aggregate id.", example = "task-1001")
    private String aggregateId;

    @Schema(description = "Request trace id for log correlation.")
    private String traceId;

    @Schema(description = "Event occurrence time.")
    private OffsetDateTime occurredAt;

    @Schema(description = "Event payload.")
    private T payload;

    public static <T> MqEvent<T> of(String eventType,
                                    String sourceService,
                                    String aggregateId,
                                    String traceId,
                                    T payload) {
        return MqEvent.<T>builder()
                .eventId(UUID.randomUUID().toString())
                .eventType(eventType)
                .sourceService(sourceService)
                .aggregateId(aggregateId)
                .traceId(traceId)
                .occurredAt(OffsetDateTime.now())
                .payload(payload)
                .build();
    }
}

