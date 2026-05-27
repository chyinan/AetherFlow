package com.aetherflow.ai.config;

import com.aetherflow.ai.provider.AiProviderType;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

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
}
