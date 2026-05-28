package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.Map;

@Schema(description = "AI provider LLM generation response.")
public record AiProviderResponse(
        @Schema(description = "Provider that served the request.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Model that served the request.", example = "gpt-4o-mini")
        String model,

        @Schema(description = "Generated text.", example = "Meeting action items")
        String text,

        @Schema(description = "Provider-specific metadata.", example = "{\"tokens\":128}")
        Map<String, Object> metadata
) {
}
