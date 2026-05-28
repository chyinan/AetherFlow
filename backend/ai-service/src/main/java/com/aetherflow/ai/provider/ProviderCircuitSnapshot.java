package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;

@Schema(description = "AI provider circuit breaker snapshot.")
public record ProviderCircuitSnapshot(
        @Schema(description = "Provider name.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Circuit state.", example = "CLOSED")
        ProviderCircuitState state,

        @Schema(description = "Current consecutive failures.", example = "0")
        int consecutiveFailures,

        @Schema(description = "Circuit open-until time.")
        Instant openUntil,

        @Schema(description = "Last update time.")
        Instant updatedAt,

        @Schema(description = "Circuit state reason.", example = "provider request succeeded")
        String reason
) {

    public static ProviderCircuitSnapshot closed(AiProviderType provider) {
        return new ProviderCircuitSnapshot(provider, ProviderCircuitState.CLOSED, 0, null, Instant.now(), null);
    }
}
