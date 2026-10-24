package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProviderHealthAttributionTest {

    @Test
    void pythonRuntimeReachabilityIsNotReportedAsUpstreamOpenAiHealth() {
        var builder = org.springframework.web.client.RestClient.builder().baseUrl("http://python-ai");
        var server = org.springframework.test.web.client.MockRestServiceServer.bindTo(builder).build();
        server.expect(org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo("http://python-ai/ai/status"))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess(
                        "{\"llmEnabled\":true,\"providers\":[\"openai\"]}", org.springframework.http.MediaType.APPLICATION_JSON));
        OpenAIProvider provider = new OpenAIProvider(builder.build(), mock(PythonAiInferenceClientFactory.class),
                new com.aetherflow.ai.sentinel.SentinelAiGuard(), new com.fasterxml.jackson.databind.ObjectMapper());

        AiProviderHealth health = provider.health();

        org.assertj.core.api.Assertions.assertThat(health.status()).isEqualTo(ProviderHealthStatus.DEGRADED);
        org.assertj.core.api.Assertions.assertThat(health.observationSource()).isEqualTo("PYTHON_AI_RUNTIME");
        org.assertj.core.api.Assertions.assertThat(health.message()).contains("upstream provider availability was not probed");
        org.assertj.core.api.Assertions.assertThat(health.metadata())
                .containsEntry("configuredProviders", List.of("openai"))
                .containsEntry("upstreamProviderHealth", "UNKNOWN");
        server.verify();
    }

    @Test
    void missingPythonRuntimeProviderFieldsRemainUnknown() {
        var builder = org.springframework.web.client.RestClient.builder().baseUrl("http://python-ai");
        var server = org.springframework.test.web.client.MockRestServiceServer.bindTo(builder).build();
        server.expect(org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo("http://python-ai/ai/status"))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess(
                        "{\"service\":\"python-ai\"}", org.springframework.http.MediaType.APPLICATION_JSON));
        OpenAIProvider provider = new OpenAIProvider(builder.build(), mock(PythonAiInferenceClientFactory.class),
                new com.aetherflow.ai.sentinel.SentinelAiGuard(), new com.fasterxml.jackson.databind.ObjectMapper());

        AiProviderHealth health = provider.health();

        org.assertj.core.api.Assertions.assertThat(health.status()).isEqualTo(ProviderHealthStatus.UNKNOWN);
        org.assertj.core.api.Assertions.assertThat(health.healthy()).isFalse();
        org.assertj.core.api.Assertions.assertThat(health.observationSource()).isEqualTo("PYTHON_AI_RUNTIME");
        server.verify();
    }

    @Test
    void unknownOrDegradedHealthDoesNotOpenOrCloseCircuitsOrRestoreTheActiveRoute() {
        for (AiProviderHealth health : List.of(
                AiProviderHealth.unknown(AiProviderType.OPENAI, "status unavailable", "PYTHON_AI_RUNTIME", Map.of()),
                AiProviderHealth.degraded(AiProviderType.OPENAI, 5L, "runtime reachable only", "PYTHON_AI_RUNTIME", Map.of()))) {
            ProviderRoutingPolicyService policyService = mock(ProviderRoutingPolicyService.class);
            ProviderStateRepository stateRepository = mock(ProviderStateRepository.class);
            ProviderCircuitBreaker circuitBreaker = mock(ProviderCircuitBreaker.class);
            AIInferenceLogService logService = mock(AIInferenceLogService.class);
            ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
            policy.setProviders(List.of(AiProviderType.OPENAI));
            when(policyService.currentPolicy()).thenReturn(policy);
            when(stateRepository.readCircuit(AiProviderType.OPENAI)).thenReturn(new ProviderCircuitSnapshot(
                    AiProviderType.OPENAI, ProviderCircuitState.OPEN, 3, null, null, "upstream outage"));
            when(stateRepository.readActiveProvider()).thenReturn(Optional.of(AiProviderType.OLLAMA));
            ProviderHealthCheckService service = new ProviderHealthCheckService(List.of(provider(health)),
                    policyService, stateRepository, circuitBreaker, logService);

            service.checkProviders();

            verify(stateRepository).saveHealth(eq(health), any());
            verify(circuitBreaker, never()).open(any(AiProviderType.class), anyInt(), anyString(), any(ProviderRoutingPolicy.class));
            verify(circuitBreaker, never()).close(any(), any());
            verify(stateRepository, never()).saveActiveProvider(any(), any());
        }
    }

    @Test
    void onlyAnExplicitUpObservationCanRecoverAnOpenProviderRoute() {
        ProviderRoutingPolicyService policyService = mock(ProviderRoutingPolicyService.class);
        ProviderStateRepository stateRepository = mock(ProviderStateRepository.class);
        ProviderCircuitBreaker circuitBreaker = mock(ProviderCircuitBreaker.class);
        AIInferenceLogService logService = mock(AIInferenceLogService.class);
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OPENAI));
        when(policyService.currentPolicy()).thenReturn(policy);
        when(stateRepository.readCircuit(AiProviderType.OPENAI)).thenReturn(new ProviderCircuitSnapshot(
                AiProviderType.OPENAI, ProviderCircuitState.OPEN, 3, null, null, "old outage"));
        when(stateRepository.readActiveProvider()).thenReturn(Optional.of(AiProviderType.OLLAMA));
        ProviderHealthCheckService service = new ProviderHealthCheckService(
                List.of(provider(AiProviderHealth.up(AiProviderType.OPENAI, 5L, "explicit up", Map.of()))),
                policyService, stateRepository, circuitBreaker, logService);

        service.checkProviders();

        verify(circuitBreaker).close(AiProviderType.OPENAI, policy);
        verify(stateRepository).saveActiveProvider(eq(AiProviderType.OPENAI), any());
    }

    private AiProvider provider(AiProviderHealth health) {
        return new AiProvider() {
            @Override public AiProviderType type() { return health.provider(); }
            @Override public AiProviderResponse complete(AiProviderRequest request) { throw new UnsupportedOperationException(); }
            @Override public AiProviderHealth health() { return health; }
        };
    }
}
