package com.aetherflow.ai.provider;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record AIInferenceLog(
        String eventId,
        String eventType,
        AiProviderType provider,
        AiProviderType fromProvider,
        AiProviderType toProvider,
        String model,
        String message,
        long latencyMillis,
        int attempt,
        String errorMessage,
        Instant occurredAt,
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
