package com.aetherflow.ai.provider;

import java.time.Instant;

public record ProviderMetricsSnapshot(
        AiProviderType provider,
        long calls,
        long successes,
        long failures,
        long retries,
        long failovers,
        long circuitOpens,
        long lastLatencyMillis,
        long averageLatencyMillis,
        long maxLatencyMillis,
        Instant updatedAt
) {
}
