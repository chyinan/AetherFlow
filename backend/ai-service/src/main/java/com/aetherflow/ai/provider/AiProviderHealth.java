package com.aetherflow.ai.provider;

import java.time.Instant;
import java.util.Map;

public record AiProviderHealth(
        AiProviderType provider,
        ProviderHealthStatus status,
        boolean healthy,
        Instant checkedAt,
        long latencyMillis,
        String message,
        Map<String, Object> metadata
) {

    public static AiProviderHealth unknown(AiProviderType provider, String message) {
        return new AiProviderHealth(provider, ProviderHealthStatus.UNKNOWN, false, Instant.now(), -1L, message, Map.of());
    }

    public static AiProviderHealth up(AiProviderType provider, long latencyMillis, String message, Map<String, Object> metadata) {
        return new AiProviderHealth(provider, ProviderHealthStatus.UP, true, Instant.now(), latencyMillis, message, metadata == null ? Map.of() : Map.copyOf(metadata));
    }

    public static AiProviderHealth degraded(AiProviderType provider, long latencyMillis, String message, Map<String, Object> metadata) {
        return new AiProviderHealth(provider, ProviderHealthStatus.DEGRADED, true, Instant.now(), latencyMillis, message, metadata == null ? Map.of() : Map.copyOf(metadata));
    }

    public static AiProviderHealth down(AiProviderType provider, String message, Map<String, Object> metadata) {
        return new AiProviderHealth(provider, ProviderHealthStatus.DOWN, false, Instant.now(), -1L, message, metadata == null ? Map.of() : Map.copyOf(metadata));
    }
}
