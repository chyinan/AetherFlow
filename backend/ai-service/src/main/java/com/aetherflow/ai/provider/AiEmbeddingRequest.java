package com.aetherflow.ai.provider;

import java.time.Duration;
import java.util.Map;

public record AiEmbeddingRequest(
        AiProviderType provider,
        String model,
        String input,
        Map<String, Object> options,
        Duration timeout
) {
}
