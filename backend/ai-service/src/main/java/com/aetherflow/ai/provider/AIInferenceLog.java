package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Schema(description = "AI provider inference governance log entry.")
public record AIInferenceLog(
        @Schema(description = "Unique log event id.", example = "b62b50bb-4f21-4d47-b2e9-f25706cf2d0d")
        String eventId,

        @Schema(description = "Provider governance event type.", example = "SUCCESS")
        String eventType,

        @Schema(description = "Provider involved in the event.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Source provider for failover events.", example = "OPENAI")
        AiProviderType fromProvider,

        @Schema(description = "Target provider for failover events.", example = "OLLAMA")
        AiProviderType toProvider,

        @Schema(description = "Model name.", example = "gpt-4o-mini")
        String model,

        @Schema(description = "Human readable event message.", example = "provider request succeeded")
        String message,

        @Schema(description = "Request latency in milliseconds.", example = "820")
        long latencyMillis,

        @Schema(description = "Attempt index.", example = "0")
        int attempt,

        @Schema(description = "Error message when the event is a failure.", example = "timeout")
        String errorMessage,

        @Schema(description = "Event occurrence time.")
        Instant occurredAt,

        @Schema(description = "Additional event metadata.", example = "{\"failureType\":\"TIMEOUT\"}")
        Map<String, Object> metadata
) {

    public static AIInferenceLog of(String eventType,
                                    AiProviderType provider,
                                    AiProviderType fromProvider,
                                    AiProviderType toProvider,
                                    String model,
                                    String message,
                                    long latencyMillis,
                                    int attempt,
                                    String errorMessage,
                                    Map<String, Object> metadata) {
        return new AIInferenceLog(
                UUID.randomUUID().toString(),
                eventType,
                provider,
                fromProvider,
                toProvider,
                model,
                message,
                latencyMillis,
                attempt,
                errorMessage,
                Instant.now(),
                metadata == null ? Map.of() : Map.copyOf(metadata)
        );
    }
}
