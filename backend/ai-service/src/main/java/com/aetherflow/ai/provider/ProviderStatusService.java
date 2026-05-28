package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ProviderStatusService {

    private final ProviderRoutingPolicyService policyService;
    private final ProviderStateRepository stateRepository;
    private final ProviderMetricsService metricsService;
    private final AIInferenceLogService logService;
    private final AiTaskProperties properties;

    public ProviderStatusResponse currentStatus() {
        ProviderRoutingPolicy policy = policyService.currentPolicy();
        List<AiProviderType> providers = policy.getProviders();
        Map<AiProviderType, ProviderCircuitSnapshot> circuits = new LinkedHashMap<>();
        Map<AiProviderType, AiProviderHealth> healths = new LinkedHashMap<>();
        for (AiProviderType provider : providers) {
            circuits.put(provider, safeCircuit(provider));
            healths.put(provider, safeHealth(provider));
        }
        return new ProviderStatusResponse(
                stateRepository.readActiveProvider().orElse(null),
                policy,
                circuits,
                healths,
                metricsService.snapshot(providers),
                logService.recent(properties.getProviderRecentLogLimit())
        );
    }

    private ProviderCircuitSnapshot safeCircuit(AiProviderType provider) {
        ProviderCircuitSnapshot snapshot = stateRepository.readCircuit(provider);
        return snapshot == null ? ProviderCircuitSnapshot.closed(provider) : snapshot;
    }

    private AiProviderHealth safeHealth(AiProviderType provider) {
        AiProviderHealth health = stateRepository.readHealth(provider);
        return health == null ? AiProviderHealth.unknown(provider, "health not available") : health;
    }
}
