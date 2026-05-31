package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Provider runtime configuration catalog with masked credentials only.")
public record ProviderRuntimeConfigCatalogResponse(
        @Schema(description = "Available provider presets and their current runtime configuration state.")
        List<ProviderRuntimeConfig> providers
) {
    public static ProviderRuntimeConfigCatalogResponse empty() {
        return new ProviderRuntimeConfigCatalogResponse(List.of());
    }

    @Schema(description = "Single provider preset runtime configuration state.")
    public record ProviderRuntimeConfig(
            @Schema(description = "Provider preset id.", example = "openrouter")
            String id,

            @Schema(description = "Display name.", example = "OpenRouter")
            String name,

            @Schema(description = "Provider integration type.", example = "openai-compatible")
            String providerType,

            @Schema(description = "Configured base URL.", example = "https://openrouter.ai/api/v1")
            String baseUrl,

            @Schema(description = "Default model name.", example = "qwen/qwen3.5-9b")
            String defaultModel,

            @Schema(description = "Whether the preset has enough configuration to be used.")
            boolean configured,

            @Schema(description = "Whether the preset is enabled.")
            boolean enabled,

            @Schema(description = "Whether an API key is configured. The key value itself is never returned.")
            boolean apiKeyConfigured,

            @Schema(description = "Masked API key preview.")
            String apiKeyPreview,

            @Schema(description = "Provider capability tags.")
            List<String> tags,

            @Schema(description = "Provider description.")
            String description,

            @Schema(description = "Provider region class.", example = "global")
            String region
    ) {
    }
}
