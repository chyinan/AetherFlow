package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;

@Schema(description = "AI provider metrics snapshot.")
public record ProviderMetricsSnapshot(
        @Schema(description = "Provider name.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Total provider call count.", example = "120")
        long calls,

        @Schema(description = "Successful call count.", example = "116")
        long successes,

        @Schema(description = "Failed call count.", example = "4")
        long failures,

        @Schema(description = "Retry count.", example = "3")
        long retries,

        @Schema(description = "Failover count.", example = "1")
        long failovers,

        @Schema(description = "Circuit open count.", example = "1")
        long circuitOpens,

        @Schema(description = "Last latency in milliseconds.", example = "820")
        long lastLatencyMillis,

        @Schema(description = "Average latency in milliseconds.", example = "900")
        long averageLatencyMillis,

        @Schema(description = "Max latency in milliseconds.", example = "2100")
        long maxLatencyMillis,

        @Schema(description = "Last metrics update time.")
        Instant updatedAt
) {
}
