package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
@Schema(description = "Notification message sent to notify-service.")
public class NotifyMessageDTO {

    @Schema(description = "Target user id.", example = "10001")
    private Long userId;

    @Schema(description = "Stable notification event id for idempotent delivery.", example = "ai-task:59:node-1:succeeded")
    private String eventId;

    @Schema(description = "Notification channel.", example = "WORKFLOW")
    private String channel;

    @Schema(description = "Notification event type.", example = "WORKFLOW_COMPLETED")
    private String eventType;

    @Schema(description = "Notification payload.", example = "{\"workflowId\":\"workflow-1001\",\"title\":\"Workflow completed\"}")
    private Map<String, Object> payload;

    @Schema(description = "Event occurrence time.")
    private OffsetDateTime occurredAt;
}

