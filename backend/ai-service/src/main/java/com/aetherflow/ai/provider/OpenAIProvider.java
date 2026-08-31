package com.aetherflow.ai.provider;

import com.aetherflow.ai.sentinel.SentinelAiGuard;
import org.springframework.beans.factory.annotation.Qualifier;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class OpenAIProvider extends PythonRuntimeAiProvider {

    public OpenAIProvider(@Qualifier("pythonAiStatusRestClient") RestClient pythonAiStatusRestClient,
                          PythonAiInferenceClientFactory inferenceClientFactory,
                          SentinelAiGuard sentinelAiGuard,
                          ObjectMapper objectMapper) {
        super(pythonAiStatusRestClient, inferenceClientFactory, sentinelAiGuard, objectMapper);
    }

    @Override
    public AiProviderType type() {
        return AiProviderType.OPENAI;
    }
}
