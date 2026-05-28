package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.provider.AIInferenceLogService;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.provider.ProviderMetricsResponse;
import com.aetherflow.ai.provider.ProviderMetricsService;
import com.aetherflow.ai.provider.ProviderRecoveryService;
import com.aetherflow.ai.provider.ProviderRoutingPolicy;
import com.aetherflow.ai.provider.ProviderRoutingPolicyService;
import com.aetherflow.ai.provider.ProviderStatusResponse;
import com.aetherflow.ai.provider.ProviderStatusService;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.core.Result;
import org.junit.jupiter.api.Test;

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
        AiProviderController controller = controller(metricsService, policyService, logService);
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        when(policyService.currentPolicy()).thenReturn(policy);
        when(metricsService.snapshot(policy.getProviders())).thenReturn(Map.of());
        when(logService.recent(20)).thenReturn(List.of());

        Result<ProviderMetricsResponse> result = controller.metrics();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().metrics()).isEmpty();
        verify(metricsService).snapshot(policy.getProviders());
    }

    private AiProviderController controller(ProviderStatusService statusService) {
        return new AiProviderController(
                statusService,
                mock(ProviderRoutingPolicyService.class),
                mock(ProviderMetricsService.class),
                mock(AIInferenceLogService.class),
                mock(ProviderRecoveryService.class),
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
                new AiTaskProperties(),
                new SentinelAiGuard()
        );
    }

    private AiProviderController controller(ProviderMetricsService metricsService,
                                            ProviderRoutingPolicyService policyService,
                                            AIInferenceLogService logService) {
        return new AiProviderController(
                mock(ProviderStatusService.class),
                policyService,
                metricsService,
                logService,
                mock(ProviderRecoveryService.class),
                new AiTaskProperties(),
                new SentinelAiGuard()
        );
    }
}
