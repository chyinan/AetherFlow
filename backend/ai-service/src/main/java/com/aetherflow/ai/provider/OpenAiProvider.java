package com.aetherflow.ai.provider;

import com.aetherflow.ai.sentinel.SentinelAiGuard;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.client.RestClient;

@Component
public class OpenAiProvider extends PythonRuntimeAiProvider {

    public OpenAiProvider(@Qualifier("pythonAiRestClient") RestClient pythonAiRestClient,
                          SentinelAiGuard sentinelAiGuard) {
        super(pythonAiRestClient, sentinelAiGuard);
    }

    @Override
    public AiProviderType type() {
        return AiProviderType.OPENAI;
    }
}
