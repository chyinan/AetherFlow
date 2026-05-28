package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.provider.ProviderMetricsResponse;
import com.aetherflow.ai.provider.ProviderMetricsService;
import com.aetherflow.ai.provider.ProviderRecoveryService;
import com.aetherflow.ai.provider.ProviderRoutingPolicy;
import com.aetherflow.ai.provider.ProviderRoutingPolicyService;
import com.aetherflow.ai.provider.ProviderStatusResponse;
import com.aetherflow.ai.provider.ProviderStatusService;
import com.aetherflow.ai.provider.AIInferenceLogService;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.core.Result;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ai/provider")
@RequiredArgsConstructor
public class AiProviderController {

    private final ProviderStatusService statusService;
    private final ProviderRoutingPolicyService policyService;
    private final ProviderMetricsService metricsService;
    private final AIInferenceLogService logService;
    private final ProviderRecoveryService recoveryService;
    private final AiTaskProperties properties;
    private final SentinelAiGuard sentinelAiGuard;

    @GetMapping("/status")
    public Result<ProviderStatusResponse> status() {
        return Result.success(sentinelAiGuard.execute("ai-provider-status", statusService::currentStatus));
    }

    @GetMapping("/policy")
    public Result<ProviderRoutingPolicy> policy() {
        return Result.success(sentinelAiGuard.execute("ai-provider-policy", policyService::currentPolicy));
    }

    @PutMapping("/policy")
    public Result<ProviderRoutingPolicy> updatePolicy(@Valid @RequestBody ProviderRoutingPolicy policy) {
        return Result.success(sentinelAiGuard.execute("ai-provider-policy", () -> policyService.updatePolicy(policy)));
    }

    @PostMapping("/policy/recover/{provider}")
    public Result<ProviderStatusResponse> recover(@PathVariable AiProviderType provider) {
        return Result.success(sentinelAiGuard.execute("ai-provider-policy", () -> {
            recoveryService.recover(provider);
            return statusService.currentStatus();
        }));
    }

    @GetMapping("/metrics")
    public Result<ProviderMetricsResponse> metrics() {
        return Result.success(sentinelAiGuard.execute("ai-provider-metrics", () -> {
            ProviderRoutingPolicy policy = policyService.currentPolicy();
            return new ProviderMetricsResponse(
                    metricsService.snapshot(policy.getProviders()),
                    logService.recent(properties.getProviderRecentMetricsLimit())
            );
        }));
    }
}
