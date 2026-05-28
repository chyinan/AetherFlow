package com.aetherflow.ai.provider;

import java.util.List;
import java.util.Map;

public record ProviderMetricsResponse(
        Map<AiProviderType, ProviderMetricsSnapshot> metrics,
        List<AIInferenceLog> recentLogs
) {
}
