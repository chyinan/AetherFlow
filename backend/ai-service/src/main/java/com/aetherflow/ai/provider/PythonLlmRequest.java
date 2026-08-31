package com.aetherflow.ai.provider;

// pattern: Functional Core

import java.util.Map;

public record PythonLlmRequest(
        String provider,
        String model,
        String prompt,
        Map<String, Object> options,
        Double timeoutSeconds
) {
}
