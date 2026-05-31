package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiTaskProperties;
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
import com.aetherflow.ai.provider.ProviderRuntimeLogResponse;
import com.aetherflow.ai.provider.ProviderStatusResponse;
import com.aetherflow.ai.provider.ProviderStatusService;
import com.aetherflow.ai.provider.AIInferenceLogService;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.core.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "AI Provider", description = "Frontend public AI provider routing, health, policy and metrics management APIs.")
@RestController
@RequestMapping("/ai/provider")
@RequiredArgsConstructor
public class AiProviderController {

    private final ProviderStatusService statusService;
    private final ProviderRoutingPolicyService policyService;
    private final ProviderMetricsService metricsService;
    private final AIInferenceLogService logService;
    private final ProviderRecoveryService recoveryService;
    private final ProviderCatalogService catalogService;
    private final ProviderRuntimeConfigClient configClient;
    private final AiTaskProperties properties;
    private final SentinelAiGuard sentinelAiGuard;

    @Operation(summary = "Get AI provider status",
            description = "Returns active provider, routing policy, circuit states, health states, metrics and recent logs.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Provider status returned.",
                    content = @Content(schema = @Schema(implementation = ProviderStatusResponse.class))),
            @ApiResponse(responseCode = "429", description = "Provider status request rate limited."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/status")
    public Result<ProviderStatusResponse> status() {
        return Result.success(sentinelAiGuard.execute("ai-provider-status", statusService::currentStatus));
    }

    @Operation(summary = "Get AI provider routing policy",
            description = "Returns current provider failover, retry, circuit breaker and health check policy.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Routing policy returned.",
                    content = @Content(schema = @Schema(implementation = ProviderRoutingPolicy.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/policy")
    public Result<ProviderRoutingPolicy> policy() {
        return Result.success(sentinelAiGuard.execute("ai-provider-policy", policyService::currentPolicy));
    }

    @Operation(summary = "Update AI provider routing policy",
            description = "Updates provider priority, failover, retry, circuit breaker and health check policy.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Routing policy updated.",
                    content = @Content(schema = @Schema(implementation = ProviderRoutingPolicy.class))),
            @ApiResponse(responseCode = "400", description = "Invalid routing policy."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PutMapping("/policy")
    public Result<ProviderRoutingPolicy> updatePolicy(@Valid @RequestBody ProviderRoutingPolicy policy) {
        return Result.success(sentinelAiGuard.execute("ai-provider-policy", () -> policyService.updatePolicy(policy)));
    }

    @Operation(summary = "Recover AI provider circuit",
            description = "Manually recovers one provider circuit and returns refreshed provider status.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Provider recovery requested.",
                    content = @Content(schema = @Schema(implementation = ProviderStatusResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid provider type."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PostMapping("/policy/recover/{provider}")
    public Result<ProviderStatusResponse> recover(@Parameter(description = "Provider to recover.", example = "OPENAI")
                                                  @PathVariable AiProviderType provider) {
        return Result.success(sentinelAiGuard.execute("ai-provider-policy", () -> {
            recoveryService.recover(provider);
            return statusService.currentStatus();
        }));
    }

    @Operation(summary = "Get AI provider metrics",
            description = "Returns provider metrics and recent inference logs for frontend monitoring.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Provider metrics returned.",
                    content = @Content(schema = @Schema(implementation = ProviderMetricsResponse.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
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

    @Operation(summary = "Get AI provider model catalog",
            description = "Returns frontend-shaped provider cards and model catalog metadata.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Provider catalog returned.",
                    content = @Content(schema = @Schema(implementation = ProviderCatalogResponse.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/catalog")
    public Result<ProviderCatalogResponse> catalog() {
        return Result.success(sentinelAiGuard.execute("ai-provider-catalog",
                () -> catalogService.catalog(policyService.currentPolicy())));
    }

    @Operation(summary = "Get provider runtime configuration",
            description = "Returns provider presets and masked runtime configuration state. API key values are never returned.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Provider configuration catalog returned.",
                    content = @Content(schema = @Schema(implementation = ProviderRuntimeConfigCatalogResponse.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/config")
    public Result<ProviderRuntimeConfigCatalogResponse> config() {
        return Result.success(sentinelAiGuard.execute("ai-provider-config", configClient::catalog));
    }

    @Operation(summary = "Update provider runtime configuration",
            description = "Updates a provider preset in python-ai-service runtime configuration and returns masked state.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Provider configuration updated.",
                    content = @Content(schema = @Schema(implementation = ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig.class))),
            @ApiResponse(responseCode = "400", description = "Invalid provider configuration."),
            @ApiResponse(responseCode = "404", description = "Unknown provider preset."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PutMapping("/config/{provider}")
    public Result<ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig> updateConfig(
            @Parameter(description = "Provider preset id.", example = "openrouter")
            @PathVariable String provider,
            @Valid @RequestBody ProviderRuntimeConfigRequest request) {
        return Result.success(sentinelAiGuard.execute("ai-provider-config",
                () -> configClient.update(provider, request)));
    }

    @Operation(summary = "Get AI provider runtime logs",
            description = "Returns frontend-shaped AI provider runtime log feed.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Provider runtime logs returned.",
                    content = @Content(schema = @Schema(implementation = ProviderRuntimeLogResponse.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/logs")
    public Result<ProviderRuntimeLogResponse> logs(
            @Parameter(description = "Maximum number of recent log entries, capped at 100.", example = "50")
            @RequestParam(defaultValue = "20") int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        return Result.success(sentinelAiGuard.execute("ai-provider-logs",
                () -> ProviderRuntimeLogResponse.from(logService.recent(boundedLimit))));
    }
}
