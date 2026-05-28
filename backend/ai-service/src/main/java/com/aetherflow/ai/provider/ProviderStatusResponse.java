package com.aetherflow.ai.provider;

import java.util.List;
import java.util.Map;

public record ProviderStatusResponse(
        AiProviderType activeProvider,
        ProviderRoutingPolicy routingPolicy,
        Map<AiProviderType, ProviderCircuitSnapshot> circuitStates,
        Map<AiProviderType, AiProviderHealth> healthStates,
        Map<AiProviderType, ProviderMetricsSnapshot> metrics,
        List<AIInferenceLog> recentLogs
) {
}
