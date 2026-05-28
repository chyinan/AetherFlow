package com.aetherflow.ai.provider;

import java.time.Instant;

public record ProviderCircuitSnapshot(
        AiProviderType provider,
        ProviderCircuitState state,
        int consecutiveFailures,
        Instant openUntil,
        Instant updatedAt,
        String reason
) {

    public static ProviderCircuitSnapshot closed(AiProviderType provider) {
        return new ProviderCircuitSnapshot(provider, ProviderCircuitState.CLOSED, 0, null, Instant.now(), null);
    }
}
