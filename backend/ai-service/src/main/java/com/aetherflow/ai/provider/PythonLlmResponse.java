package com.aetherflow.ai.provider;

import java.util.Map;

public record PythonLlmResponse(
        String provider,
        String model,
        String text,
        Map<String, Object> metadata
) {
}
