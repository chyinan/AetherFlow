package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.provider.AIInferenceLogService;
import com.aetherflow.ai.provider.AIInferenceLog;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.provider.ProviderCatalogResponse;
import com.aetherflow.ai.provider.ProviderCatalogService;
import com.aetherflow.ai.provider.ProviderMetricsResponse;
import com.aetherflow.ai.provider.ProviderMetricsService;
import com.aetherflow.ai.provider.ProviderRecoveryService;
import com.aetherflow.ai.provider.ProviderRoutingPolicy;
import com.aetherflow.ai.provider.ProviderRoutingPolicyService;
import com.aetherflow.ai.provider.ProviderRuntimeConfigCatalogResponse;
import com.aetherflow.ai.provider.ProviderRuntimeConfigClient;
import com.aetherflow.ai.provider.ProviderRuntimeConfigRequest;
import com.aetherflow.ai.provider.ProviderRuntimeCatalogClient;
import com.aetherflow.ai.provider.ProviderRuntimeLogResponse;
import com.aetherflow.ai.provider.ProviderStatusResponse;
import com.aetherflow.ai.provider.ProviderStatusService;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.core.Result;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiProviderControllerTest {

    @Test
    void exposesProviderStatusForFrontendMonitoring() {
        ProviderStatusService statusService = mock(ProviderStatusService.class);
        AiProviderController controller = controller(statusService);
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        ProviderStatusResponse response = new ProviderStatusResponse(
                AiProviderType.OPENAI,
                policy,
                Map.of(),
                Map.of(),
                Map.of(),
                List.of()
        );
        when(statusService.currentStatus()).thenReturn(response);

        Result<ProviderStatusResponse> result = controller.status();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().activeProvider()).isEqualTo(AiProviderType.OPENAI);
    }

    @Test
    void updatesProviderRoutingPolicy() {
        ProviderRoutingPolicyService policyService = mock(ProviderRoutingPolicyService.class);
        AiProviderController controller = controller(policyService);
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OLLAMA, AiProviderType.OPENAI));
        when(policyService.updatePolicy(policy)).thenReturn(policy);

        Result<ProviderRoutingPolicy> result = controller.updatePolicy(policy);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getProviders()).containsExactly(AiProviderType.OLLAMA, AiProviderType.OPENAI);
        verify(policyService).updatePolicy(policy);
    }

    @Test
    void exposesMetricsWithRecentInferenceLogs() {
        ProviderMetricsService metricsService = mock(ProviderMetricsService.class);
        ProviderRoutingPolicyService policyService = mock(ProviderRoutingPolicyService.class);
        AIInferenceLogService logService = mock(AIInferenceLogService.class);
        AiProviderController controller = controller(metricsService, policyService, logService, catalogService(new AiTaskProperties()));
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        when(policyService.currentPolicy()).thenReturn(policy);
        when(metricsService.snapshot(policy.getProviders())).thenReturn(Map.of());
        when(logService.recent(20)).thenReturn(List.of());

        Result<ProviderMetricsResponse> result = controller.metrics();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().metrics()).isEmpty();
        verify(metricsService).snapshot(policy.getProviders());
    }

    @Test
    void exposesProviderCatalogForFrontendModelsPage() {
        ProviderRoutingPolicyService policyService = mock(ProviderRoutingPolicyService.class);
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultProvider(AiProviderType.OPENAI);
        properties.setDefaultModel("gpt-4o-mini");
        AiProviderController controller = controller(
                mock(ProviderMetricsService.class),
                policyService,
                mock(AIInferenceLogService.class),
                catalogService(properties)
        );
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));
        when(policyService.currentPolicy()).thenReturn(policy);

        Result<ProviderCatalogResponse> result = controller.catalog();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().providers())
                .extracting(ProviderCatalogResponse.ProviderCatalogProvider::endpointLabel)
                .contains("OpenAI API", "Ollama Local Runtime");
        assertThat(result.getData().models())
                .anySatisfy(model -> {
                    assertThat(model.name()).isEqualTo("gpt-4o-mini");
                    assertThat(model.contextWindow()).isNotBlank();
                    assertThat(model.pricing().priceHint()).isNotBlank();
                    assertThat(model.capabilities()).contains("chat");
                });
    }

    @Test
    void exposesFrontendShapedProviderRuntimeLogs() {
        AIInferenceLogService logService = mock(AIInferenceLogService.class);
        AiProviderController controller = controller(
                mock(ProviderMetricsService.class),
                mock(ProviderRoutingPolicyService.class),
                logService,
                catalogService(new AiTaskProperties())
        );
        AIInferenceLog log = new AIInferenceLog(
                "evt-1",
                "ERROR",
                AiProviderType.OPENAI,
                null,
                null,
                "gpt-4o-mini",
                "provider request failed",
                1200L,
                2,
                "timeout",
                Instant.parse("2026-05-29T10:00:00Z"),
                Map.of("failureType", "TIMEOUT")
        );
        when(logService.recent(50)).thenReturn(List.of(log));

        Result<ProviderRuntimeLogResponse> result = controller.logs(50);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().logs()).hasSize(1);
        assertThat(result.getData().logs().get(0).id()).isEqualTo("evt-1");
        assertThat(result.getData().logs().get(0).level()).isEqualTo("error");
        assertThat(result.getData().logs().get(0).message()).contains("timeout");
        verify(logService).recent(50);
    }

    @Test
    void proxiesProviderRuntimeConfigurationWithoutLeakingApiKey() {
        ProviderRuntimeConfigClient configClient = mock(ProviderRuntimeConfigClient.class);
        AiProviderController controller = controller(configClient);
        ProviderRuntimeConfigRequest request = new ProviderRuntimeConfigRequest(
                true,
                "sk-demo-secret",
                "https://openrouter.ai/api/v1",
                "qwen/qwen3.5-9b"
        );
        ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig provider =
                new ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig(
                        "openrouter",
                        "OpenRouter",
                        "openai-compatible",
                        "https://openrouter.ai/api/v1",
                        "qwen/qwen3.5-9b",
                        true,
                        true,
                        true,
                        "sk-••••••ret",
                        List.of("chat", "openai-compatible"),
                        "OpenAI-compatible hosted model gateway.",
                        "global"
                );
        when(configClient.update("openrouter", request)).thenReturn(provider);

        Result<ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig> result =
                controller.updateConfig("openrouter", request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().id()).isEqualTo("openrouter");
        assertThat(result.getData().apiKeyPreview()).doesNotContain("demo-secret");
        verify(configClient).update("openrouter", request);
    }

    private AiProviderController controller(ProviderStatusService statusService) {
        return new AiProviderController(
                statusService,
                mock(ProviderRoutingPolicyService.class),
                mock(ProviderMetricsService.class),
                mock(AIInferenceLogService.class),
                mock(ProviderRecoveryService.class),
                catalogService(new AiTaskProperties()),
                mock(ProviderRuntimeConfigClient.class),
                new AiTaskProperties(),
                new SentinelAiGuard()
        );
    }

    private AiProviderController controller(ProviderRoutingPolicyService policyService) {
        return new AiProviderController(
                mock(ProviderStatusService.class),
                policyService,
                mock(ProviderMetricsService.class),
                mock(AIInferenceLogService.class),
                mock(ProviderRecoveryService.class),
                catalogService(new AiTaskProperties()),
                mock(ProviderRuntimeConfigClient.class),
                new AiTaskProperties(),
                new SentinelAiGuard()
        );
    }

    private AiProviderController controller(ProviderMetricsService metricsService,
                                            ProviderRoutingPolicyService policyService,
                                            AIInferenceLogService logService,
                                            ProviderCatalogService catalogService) {
        return new AiProviderController(
                mock(ProviderStatusService.class),
                policyService,
                metricsService,
                logService,
                mock(ProviderRecoveryService.class),
                catalogService,
                mock(ProviderRuntimeConfigClient.class),
                new AiTaskProperties(),
                new SentinelAiGuard()
        );
    }

    private AiProviderController controller(ProviderRuntimeConfigClient configClient) {
        return new AiProviderController(
                mock(ProviderStatusService.class),
                mock(ProviderRoutingPolicyService.class),
                mock(ProviderMetricsService.class),
                mock(AIInferenceLogService.class),
                mock(ProviderRecoveryService.class),
                catalogService(new AiTaskProperties()),
                configClient,
                new AiTaskProperties(),
                new SentinelAiGuard()
        );
    }

    private ProviderCatalogService catalogService(AiTaskProperties properties) {
        return new ProviderCatalogService(properties, ProviderRuntimeCatalogClient.empty());
    }
}
