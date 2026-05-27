package com.aetherflow.ai.provider;

import com.aetherflow.ai.sentinel.SentinelAiGuard;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.client.RestClient;

@Component
public class OllamaProvider extends PythonRuntimeAiProvider {

    public OllamaProvider(@Qualifier("pythonAiRestClient") RestClient pythonAiRestClient,
                          SentinelAiGuard sentinelAiGuard) {
        super(pythonAiRestClient, sentinelAiGuard);
    }

    @Override
    public AiProviderType type() {
        return AiProviderType.OLLAMA;
    }
}
