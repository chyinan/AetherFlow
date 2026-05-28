package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Duration;
import java.util.Map;

@Schema(description = "AI provider LLM generation request.")
public record AiProviderRequest(
        @Schema(description = "Requested provider. When null, routing policy selects one.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Model name.", example = "gpt-4o-mini")
        String model,

        @Schema(description = "Prompt text.", example = "Summarize this transcript.")
        String prompt,

        @Schema(description = "Provider-specific options.", example = "{\"temperature\":0.2}")
        Map<String, Object> options,

        @Schema(description = "Request timeout.", example = "PT60S")
        Duration timeout
) {

    public AiProviderRequest withProvider(AiProviderType providerType) {
        return new AiProviderRequest(providerType, model, prompt, options, timeout);
    }
}
