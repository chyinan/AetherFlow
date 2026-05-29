package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@Data
@Schema(description = "AI provider routing, retry, failover and circuit breaker policy.")
public class ProviderRoutingPolicy {

    @Schema(description = "Whether provider failover is enabled.", example = "true")
    private boolean enableFailover = true;

    @Schema(description = "Whether the primary provider can auto recover after health checks.", example = "true")
    private boolean autoRecoverPrimary = true;

    @Schema(description = "Provider priority list.", example = "[\"OPENAI\",\"OLLAMA\"]")
    private List<AiProviderType> providers = new ArrayList<>(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));

    @Schema(description = "Maximum retry attempts per provider request.", example = "2")
    private int maxRetries = 2;

    @Schema(description = "Initial retry backoff duration.", example = "PT0.2S")
    private Duration retryInitialBackoff = Duration.ofMillis(200);

    @Schema(description = "Maximum retry backoff duration.", example = "PT2S")
    private Duration retryMaxBackoff = Duration.ofSeconds(2);

    @Schema(description = "Maximum provider request duration before timing out.", example = "PT60S")
    private Duration requestTimeout = Duration.ofSeconds(60);

    @Schema(description = "Consecutive failure threshold before opening provider circuit.", example = "5")
    private int circuitFailureThreshold = 5;

    @Schema(description = "Circuit open duration.", example = "PT60S")
    private Duration circuitOpenDuration = Duration.ofSeconds(60);

    @Schema(description = "Provider health check interval.", example = "PT30S")
    private Duration healthCheckInterval = Duration.ofSeconds(30);

    public ProviderRoutingPolicy normalized() {
        ProviderRoutingPolicy policy = copy();
        LinkedHashSet<AiProviderType> unique = new LinkedHashSet<>();
        if (policy.providers != null) {
            for (AiProviderType provider : policy.providers) {
                if (provider != null) {
                    unique.add(provider);
                }
            }
        }
        if (unique.isEmpty()) {
            unique.addAll(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));
        }
        policy.providers = new ArrayList<>(unique);
        policy.maxRetries = Math.max(0, policy.maxRetries);
        policy.circuitFailureThreshold = Math.max(1, policy.circuitFailureThreshold);
        policy.retryInitialBackoff = ensureDuration(policy.retryInitialBackoff, Duration.ofMillis(200));
        policy.retryMaxBackoff = ensureDuration(policy.retryMaxBackoff, Duration.ofSeconds(2));
        policy.requestTimeout = ensureDuration(policy.requestTimeout, Duration.ofSeconds(60));
        policy.circuitOpenDuration = ensureDuration(policy.circuitOpenDuration, Duration.ofSeconds(60));
        policy.healthCheckInterval = ensureDuration(policy.healthCheckInterval, Duration.ofSeconds(30));
        return policy;
    }

    public List<AiProviderType> orderedCandidates(AiProviderType requestedProvider) {
        ProviderRoutingPolicy policy = normalized();
        LinkedHashSet<AiProviderType> ordered = new LinkedHashSet<>();
        if (requestedProvider != null) {
            ordered.add(requestedProvider);
        }
        ordered.addAll(policy.providers);
        return new ArrayList<>(ordered);
    }

    public ProviderRoutingPolicy copy() {
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setEnableFailover(enableFailover);
        policy.setAutoRecoverPrimary(autoRecoverPrimary);
        policy.setProviders(providers == null ? null : new ArrayList<>(providers));
        policy.setMaxRetries(maxRetries);
        policy.setRetryInitialBackoff(retryInitialBackoff);
        policy.setRetryMaxBackoff(retryMaxBackoff);
        policy.setRequestTimeout(requestTimeout);
        policy.setCircuitFailureThreshold(circuitFailureThreshold);
        policy.setCircuitOpenDuration(circuitOpenDuration);
        policy.setHealthCheckInterval(healthCheckInterval);
        return policy;
    }

    private Duration ensureDuration(Duration value, Duration fallback) {
        return Objects.requireNonNullElse(value, fallback);
    }
}
