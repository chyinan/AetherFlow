package com.aetherflow.ai.provider;

public interface AiProvider {

    AiProviderType type();

    AiProviderResponse complete(AiProviderRequest request);
}
