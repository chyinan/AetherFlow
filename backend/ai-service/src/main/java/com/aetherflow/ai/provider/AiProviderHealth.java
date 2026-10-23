package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Map;

@Schema(description = "AI provider health snapshot.")
public record AiProviderHealth(
        @Schema(description = "Provider name.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Provider health status.", example = "UP")
        ProviderHealthStatus status,

        @Schema(description = "Whether provider is currently healthy.", example = "true")
        boolean healthy,

        @Schema(description = "Last health check time.")
        Instant checkedAt,

        @Schema(description = "Health check latency in milliseconds.", example = "120")
        long latencyMillis,

        @Schema(description = "Health check message.", example = "provider health check succeeded")
        String message,

        @Schema(description = "Component whose health was observed.", example = "PYTHON_AI_RUNTIME")
        String observationSource,

        @Schema(description = "Provider-specific health metadata.", example = "{\"model\":\"gpt-4o-mini\"}")
        Map<String, Object> metadata
) {

    public static AiProviderHealth unknown(AiProviderType provider, String message) {
        return unknown(provider, message, "PROVIDER_ADAPTER", Map.of());
    }

    public static AiProviderHealth unknown(AiProviderType provider, String message, String observationSource,
                                           Map<String, Object> metadata) {
        return new AiProviderHealth(provider, ProviderHealthStatus.UNKNOWN, false, Instant.now(), -1L, message,
                observationSource, metadata == null ? Map.of() : Map.copyOf(metadata));
    }

    public static AiProviderHealth up(AiProviderType provider, long latencyMillis, String message, Map<String, Object> metadata) {
        return new AiProviderHealth(provider, ProviderHealthStatus.UP, true, Instant.now(), latencyMillis, message,
                "PROVIDER_ADAPTER", metadata == null ? Map.of() : Map.copyOf(metadata));
    }

    public static AiProviderHealth degraded(AiProviderType provider, long latencyMillis, String message, Map<String, Object> metadata) {
        return degraded(provider, latencyMillis, message, "PROVIDER_ADAPTER", metadata);
    }

    public static AiProviderHealth degraded(AiProviderType provider, long latencyMillis, String message,
                                            String observationSource, Map<String, Object> metadata) {
        return new AiProviderHealth(provider, ProviderHealthStatus.DEGRADED, true, Instant.now(), latencyMillis,
                message, observationSource, metadata == null ? Map.of() : Map.copyOf(metadata));
    }

    public static AiProviderHealth down(AiProviderType provider, String message, Map<String, Object> metadata) {
        return down(provider, message, "PROVIDER_ADAPTER", metadata);
    }

    public static AiProviderHealth down(AiProviderType provider, String message, String observationSource,
                                        Map<String, Object> metadata) {
        return new AiProviderHealth(provider, ProviderHealthStatus.DOWN, false, Instant.now(), -1L, message,
                observationSource, metadata == null ? Map.of() : Map.copyOf(metadata));
    }
}
