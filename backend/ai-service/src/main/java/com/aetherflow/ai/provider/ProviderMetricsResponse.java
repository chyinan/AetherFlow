package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.Map;

@Schema(description = "AI provider metrics response.")
public record ProviderMetricsResponse(
        @Schema(description = "Metrics by provider.")
        Map<AiProviderType, ProviderMetricsSnapshot> metrics,

        @Schema(description = "Recent provider inference logs.")
        List<AIInferenceLog> recentLogs
) {
}
