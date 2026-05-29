package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Schema(description = "Frontend-shaped AI provider runtime log feed.")
public record ProviderRuntimeLogResponse(
        @Schema(description = "Runtime log entries.")
        List<ProviderRuntimeLogEntry> logs
) {

    public static ProviderRuntimeLogResponse from(List<AIInferenceLog> inferenceLogs) {
        if (inferenceLogs == null || inferenceLogs.isEmpty()) {
            return new ProviderRuntimeLogResponse(List.of());
        }
        return new ProviderRuntimeLogResponse(inferenceLogs.stream()
                .map(ProviderRuntimeLogEntry::from)
                .toList());
    }

    @Schema(description = "Frontend runtime log entry.")
    public record ProviderRuntimeLogEntry(
            @Schema(description = "Stable log id.", example = "b62b50bb-4f21-4d47-b2e9-f25706cf2d0d")
            String id,

            @Schema(description = "Frontend level.", example = "warn")
            String level,

            @Schema(description = "Short display time.", example = "2026-05-29T10:00:00Z")
            String time,

            @Schema(description = "Provider event type.", example = "FAILOVER")
            String eventType,

            @Schema(description = "Provider involved in the event.", example = "OPENAI")
            AiProviderType provider,

            @Schema(description = "Source provider for failover events.", example = "OPENAI")
            AiProviderType fromProvider,

            @Schema(description = "Target provider for failover events.", example = "OLLAMA")
            AiProviderType toProvider,

            @Schema(description = "Model name.", example = "gpt-4o-mini")
            String model,

            @Schema(description = "Frontend display message.", example = "[ERROR] OPENAI / gpt-4o-mini: timeout")
            String message,

            @Schema(description = "Request latency in milliseconds.", example = "1200")
            long latencyMillis,

            @Schema(description = "Attempt index.", example = "2")
            int attempt,

            @Schema(description = "Error message when present.", example = "timeout")
            String errorMessage,

            @Schema(description = "Occurrence timestamp.")
            Instant occurredAt,

            @Schema(description = "Additional metadata.")
            Map<String, Object> metadata
    ) {

        private static ProviderRuntimeLogEntry from(AIInferenceLog log) {
            return new ProviderRuntimeLogEntry(
                    log.eventId(),
                    level(log),
                    log.occurredAt() == null ? "" : log.occurredAt().toString(),
                    log.eventType(),
                    log.provider(),
                    log.fromProvider(),
                    log.toProvider(),
                    log.model(),
                    displayMessage(log),
                    log.latencyMillis(),
                    log.attempt(),
                    log.errorMessage(),
                    log.occurredAt(),
                    log.metadata() == null ? Map.of() : Map.copyOf(log.metadata())
            );
        }

        private static String level(AIInferenceLog log) {
            String eventType = log.eventType() == null ? "" : log.eventType().toUpperCase(Locale.ROOT);
            if (eventType.contains("ERROR") || eventType.contains("FAIL") || eventType.contains("DOWN")
                    || "CIRCUIT_OPEN".equals(eventType) || hasText(log.errorMessage())) {
                return "error";
            }
            if (eventType.contains("RETRY") || eventType.contains("FAILOVER")
                    || eventType.contains("SKIP") || eventType.contains("DEGRADED")) {
                return "warn";
            }
            return "info";
        }

        private static String displayMessage(AIInferenceLog log) {
            String eventType = hasText(log.eventType()) ? log.eventType() : "AI_PROVIDER_EVENT";
            String provider = log.provider() == null ? "UNKNOWN" : log.provider().name();
            String model = hasText(log.model()) ? " / " + log.model() : "";
            String message = hasText(log.errorMessage()) ? log.errorMessage() : log.message();
            if (!hasText(message)) {
                message = eventType;
            }
            String latency = log.latencyMillis() > 0 ? " (" + log.latencyMillis() + "ms)" : "";
            return "[" + eventType + "] " + provider + model + ": " + message + latency;
        }

        private static boolean hasText(String value) {
            return value != null && !value.isBlank();
        }
    }
}
