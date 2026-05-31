package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Provider runtime configuration update. API keys are forwarded to python-ai-service and never returned by read APIs.")
public record ProviderRuntimeConfigRequest(
        @Schema(description = "Whether this provider preset is enabled.", example = "true")
        Boolean enabled,

        @Schema(description = "Provider API key. Empty string clears the key; null keeps the existing key.", example = "sk-...")
        String apiKey,

        @Schema(description = "Provider OpenAI-compatible base URL or local runtime URL.", example = "https://openrouter.ai/api/v1")
        String baseUrl,

        @Schema(description = "Default model name for this provider.", example = "qwen/qwen3.5-9b")
        String defaultModel
) {
}
