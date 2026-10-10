package com.aetherflow.ai.provider;

// pattern: Functional Core

import com.aetherflow.ai.config.AiTaskProperties;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProviderStatusServiceTest {

    @Test
    void userStatusUsesUserPolicyAndExposesSafeHealthAndCircuitState() {
        ProviderRoutingPolicyService policyService = mock(ProviderRoutingPolicyService.class);
        ProviderStateRepository stateRepository = mock(ProviderStateRepository.class);
        ProviderMetricsService metricsService = mock(ProviderMetricsService.class);
        AIInferenceLogService logService = mock(AIInferenceLogService.class);
        AiTaskProperties properties = new AiTaskProperties();
        ProviderRoutingPolicy userPolicy = new ProviderRoutingPolicy();
        userPolicy.setProviders(List.of(AiProviderType.OLLAMA));
        when(policyService.currentPolicy(7L)).thenReturn(userPolicy);
        AiProviderHealth health = AiProviderHealth.up(AiProviderType.OLLAMA, 12L, "healthy", Map.of());
        ProviderCircuitSnapshot circuit = ProviderCircuitSnapshot.closed(AiProviderType.OLLAMA);
        when(stateRepository.readHealth(AiProviderType.OLLAMA)).thenReturn(health);
        when(stateRepository.readCircuit(AiProviderType.OLLAMA)).thenReturn(circuit);

        ProviderStatusService service = new ProviderStatusService(
                policyService, stateRepository, metricsService, logService, properties);

        ProviderStatusResponse response = service.currentStatusForUser(7L);

        assertThat(response.routingPolicy()).isSameAs(userPolicy);
        assertThat(response.metrics()).isEmpty();
        assertThat(response.circuitStates()).containsEntry(AiProviderType.OLLAMA, circuit);
        assertThat(response.healthStates()).containsEntry(AiProviderType.OLLAMA, health);
        assertThat(response.recentLogs()).isEmpty();
    }
}
