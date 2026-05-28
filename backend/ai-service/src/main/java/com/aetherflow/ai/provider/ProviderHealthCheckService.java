package com.aetherflow.ai.provider;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
public class ProviderHealthCheckService {

    private final Map<AiProviderType, AiProvider> providers;
    private final ProviderRoutingPolicyService policyService;
    private final ProviderStateRepository stateRepository;
    private final ProviderCircuitBreaker circuitBreaker;
    private final AIInferenceLogService logService;

    public ProviderHealthCheckService(List<AiProvider> providers,
                                      ProviderRoutingPolicyService policyService,
                                      ProviderStateRepository stateRepository,
                                      ProviderCircuitBreaker circuitBreaker,
                                      AIInferenceLogService logService) {
        this.providers = new EnumMap<>(AiProviderType.class);
        for (AiProvider provider : providers) {
            this.providers.put(provider.type(), provider);
        }
        this.policyService = policyService;
        this.stateRepository = stateRepository;
        this.circuitBreaker = circuitBreaker;
        this.logService = logService;
    }

    @Scheduled(fixedDelayString = "${aetherflow.ai.provider-health-check-interval-millis:30000}")
    public void checkProviders() {
        ProviderRoutingPolicy policy = policyService.currentPolicy();
        List<AiProviderType> configuredProviders = policy.getProviders();
        if (configuredProviders.isEmpty()) {
            return;
        }
        AiProviderType primary = configuredProviders.get(0);
        for (AiProviderType providerType : configuredProviders) {
            AiProvider provider = providers.get(providerType);
            if (provider == null) {
                stateRepository.saveHealth(AiProviderHealth.down(providerType, "provider adapter is not registered", Map.of()),
                        policy.getHealthCheckInterval().plusSeconds(60));
                continue;
            }
            try {
                AiProviderHealth health = provider.health();
                stateRepository.saveHealth(health, policy.getHealthCheckInterval().plusSeconds(60));
                if (!health.healthy()) {
                    openCircuitFromHealthCheck(policy, providerType, health.message());
                    continue;
                }
                recoverHealthyProvider(policy, providerType, primary);
            } catch (RuntimeException exception) {
                log.warn("Provider health check failed provider={}", providerType, exception);
                stateRepository.saveHealth(AiProviderHealth.down(providerType, exception.getMessage(), Map.of()),
                        policy.getHealthCheckInterval().plusSeconds(60));
                openCircuitFromHealthCheck(policy, providerType, exception.getMessage());
            }
        }
    }

    private void openCircuitFromHealthCheck(ProviderRoutingPolicy policy, AiProviderType providerType, String reason) {
        ProviderCircuitSnapshot snapshot = stateRepository.readCircuit(providerType);
        if (snapshot != null && snapshot.state() == ProviderCircuitState.OPEN) {
            return;
        }
        circuitBreaker.open(providerType, Math.max(1, policy.getCircuitFailureThreshold()), "health check failed: " + reason, policy);
        logService.record(AIInferenceLog.of(
                "HEALTH_DOWN",
                providerType,
                null,
                null,
                null,
                "provider health check failed",
                0L,
                0,
                reason,
                Map.of()
        ));
    }

    private void recoverHealthyProvider(ProviderRoutingPolicy policy, AiProviderType providerType, AiProviderType primary) {
        ProviderCircuitSnapshot snapshot = stateRepository.readCircuit(providerType);
        if (snapshot != null && snapshot.state() != ProviderCircuitState.CLOSED) {
            circuitBreaker.close(providerType, policy);
        }
        Optional<AiProviderType> activeProvider = stateRepository.readActiveProvider();
        if (activeProvider.isEmpty()) {
            stateRepository.saveActiveProvider(providerType, policy.getHealthCheckInterval().plus(policy.getCircuitOpenDuration()).plusSeconds(60));
            return;
        }
        if (!policy.isAutoRecoverPrimary() || providerType != primary) {
            return;
        }
        if (activeProvider.isPresent() && activeProvider.get() == primary && (snapshot == null || snapshot.state() == ProviderCircuitState.CLOSED)) {
            return;
        }
        stateRepository.saveActiveProvider(primary, policy.getHealthCheckInterval().plus(policy.getCircuitOpenDuration()).plusSeconds(60));
        logService.record(AIInferenceLog.of(
                "AUTO_RECOVERY",
                primary,
                activeProvider.orElse(null),
                primary,
                null,
                "primary provider recovered",
                0L,
                0,
                null,
                Map.of()
        ));
    }
}
