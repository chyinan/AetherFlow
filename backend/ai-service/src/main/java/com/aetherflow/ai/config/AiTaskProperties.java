package com.aetherflow.ai.config;

import com.aetherflow.ai.provider.AiProviderType;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties(prefix = "aetherflow.ai")
public class AiTaskProperties {

    private AiProviderType defaultProvider = AiProviderType.OLLAMA;
    private String defaultModel = "llama3";
    private Duration taskCacheTtl = Duration.ofHours(6);
    private Duration providerTimeout = Duration.ofSeconds(60);
    private Duration callbackTimeout = Duration.ofSeconds(5);
    private boolean sentinelEnabled = true;
    private double taskQps = 5.0;
    private double providerQps = 2.0;
    private double httpQps = 10.0;
    private int listenerConcurrentConsumers = 2;
    private int listenerMaxConcurrentConsumers = 6;
    private int listenerPrefetch = 2;
    private boolean providerFailoverEnabled = true;
    private boolean providerAutoRecoverPrimary = true;
    private List<AiProviderType> providerPriority = new ArrayList<>(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));
    private int providerRetryMaxAttempts = 2;
    private Duration providerRetryInitialBackoff = Duration.ofMillis(200);
    private Duration providerRetryMaxBackoff = Duration.ofSeconds(2);
    private int providerCircuitFailureThreshold = 5;
    private Duration providerCircuitOpenDuration = Duration.ofSeconds(60);
    private Duration providerHealthCheckInterval = Duration.ofSeconds(30);
    private int providerRecentLogLimit = 20;
    private int providerRecentMetricsLimit = 20;
}
