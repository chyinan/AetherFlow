package com.aetherflow.ai.provider;

import java.time.Duration;
import java.util.Map;

public record AiProviderRequest(
        AiProviderType provider,
        String model,
        String prompt,
        Map<String, Object> options,
        Duration timeout
) {
}
