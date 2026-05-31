package com.aetherflow.notify.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.Map;

@Schema(description = "Notification record shown in the frontend message center.")
public record NotificationRecordResponse(
        @Schema(description = "Notification record id.", example = "1001")
        Long id,
        @Schema(description = "Target user id.", example = "7")
        Long userId,
        @Schema(description = "Notification channel.", example = "WORKFLOW")
        String channel,
        @Schema(description = "Notification event type.", example = "WORKFLOW_COMPLETED")
        String eventType,
        @Schema(description = "Notification payload.")
        Map<String, Object> payload,
        @Schema(description = "Delivery/read status.", example = "SENT")
        String status,
        @Schema(description = "Creation time.")
        LocalDateTime createdAt
) {
}
