package com.aetherflow.ai.provider;

import java.util.Locale;

public enum AiProviderType {
    OPENAI,
    OLLAMA,
    LOCAL_MODEL;

    public static AiProviderType from(String value, AiProviderType defaultType) {
        if (value == null || value.isBlank()) {
            return defaultType;
        }
        return AiProviderType.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
