package com.aetherflow.ai.provider;

import java.util.List;
import java.util.Map;

public record AiEmbeddingResponse(
        AiProviderType provider,
        String model,
        List<Double> vector,
        Map<String, Object> metadata
) {
}
