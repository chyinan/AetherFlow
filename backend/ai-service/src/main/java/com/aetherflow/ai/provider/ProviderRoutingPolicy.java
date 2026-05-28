package com.aetherflow.ai.provider;

import lombok.Data;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@Data
public class ProviderRoutingPolicy {

    private boolean enableFailover = true;
    private boolean autoRecoverPrimary = true;
    private List<AiProviderType> providers = new ArrayList<>(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));
    private int maxRetries = 2;
    private Duration retryInitialBackoff = Duration.ofMillis(200);
    private Duration retryMaxBackoff = Duration.ofSeconds(2);
    private int circuitFailureThreshold = 5;
    private Duration circuitOpenDuration = Duration.ofSeconds(60);
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
        policy.setCircuitFailureThreshold(circuitFailureThreshold);
        policy.setCircuitOpenDuration(circuitOpenDuration);
        policy.setHealthCheckInterval(healthCheckInterval);
        return policy;
    }

    private Duration ensureDuration(Duration value, Duration fallback) {
        return Objects.requireNonNullElse(value, fallback);
    }
}
