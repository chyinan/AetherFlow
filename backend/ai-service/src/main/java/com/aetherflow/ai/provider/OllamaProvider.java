package com.aetherflow.ai.provider;

import com.aetherflow.ai.sentinel.SentinelAiGuard;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.client.RestClient;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class OllamaProvider extends PythonRuntimeAiProvider {

    public OllamaProvider(@Qualifier("pythonAiStatusRestClient") RestClient pythonAiStatusRestClient,
                          PythonAiInferenceClientFactory inferenceClientFactory,
                          SentinelAiGuard sentinelAiGuard,
                          ObjectMapper objectMapper) {
        super(pythonAiStatusRestClient, inferenceClientFactory, sentinelAiGuard, objectMapper);
    }

    @Override
    public AiProviderType type() {
        return AiProviderType.OLLAMA;
    }
}
