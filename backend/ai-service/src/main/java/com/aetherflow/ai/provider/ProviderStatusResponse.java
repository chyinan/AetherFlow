package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.Map;

@Schema(description = "AI provider governance status response.")
public record ProviderStatusResponse(
        @Schema(description = "Currently active provider.", example = "OPENAI")
        AiProviderType activeProvider,

        @Schema(description = "Current routing policy.")
        ProviderRoutingPolicy routingPolicy,

        @Schema(description = "Circuit state by provider.")
        Map<AiProviderType, ProviderCircuitSnapshot> circuitStates,

        @Schema(description = "Health state by provider.")
        Map<AiProviderType, AiProviderHealth> healthStates,

        @Schema(description = "Metrics by provider.")
        Map<AiProviderType, ProviderMetricsSnapshot> metrics,

        @Schema(description = "Recent provider inference logs.")
        List<AIInferenceLog> recentLogs
) {
}
