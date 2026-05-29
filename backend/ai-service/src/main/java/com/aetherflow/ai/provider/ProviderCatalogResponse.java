package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Schema(description = "Frontend-shaped AI provider and model catalog.")
public record ProviderCatalogResponse(
        @Schema(description = "Provider cards for frontend models page.")
        List<ProviderCatalogProvider> providers,

        @Schema(description = "Model catalog rows grouped by provider.")
        List<ProviderCatalogModel> models
) {

    @Schema(description = "AI provider catalog card.")
    public record ProviderCatalogProvider(
            @Schema(description = "Stable frontend provider id.", example = "provider-openai")
            String id,

            @Schema(description = "Provider type.", example = "OPENAI")
            AiProviderType provider,

            @Schema(description = "Display name.", example = "OpenAI Gateway")
            String name,

            @Schema(description = "Runtime category.", example = "cloud llm")
            String runtime,

            @Schema(description = "Human-readable endpoint label.", example = "OpenAI API")
            String endpointLabel,

            @Schema(description = "Frontend-safe endpoint descriptor.", example = "provider-managed://openai")
            String endpoint,

            @Schema(description = "Default model for this provider.", example = "gpt-4o-mini")
            String defaultModel,

            @Schema(description = "Provider capabilities.")
            List<String> capabilities,

            @Schema(description = "Additional provider metadata.")
            Map<String, Object> metadata
    ) {
    }

    @Schema(description = "AI model catalog row.")
    public record ProviderCatalogModel(
            @Schema(description = "Stable frontend model id.", example = "model-openai-gpt-4o-mini")
            String id,

            @Schema(description = "Stable frontend provider id.", example = "provider-openai")
            String providerId,

            @Schema(description = "Provider type.", example = "OPENAI")
            AiProviderType provider,

            @Schema(description = "Model name.", example = "gpt-4o-mini")
            String name,

            @Schema(description = "Model kind.", example = "chat")
            String kind,

            @Schema(description = "Human-readable context window.", example = "128k")
            String contextWindow,

            @Schema(description = "Context window token count when known.", example = "128000")
            Integer contextWindowTokens,

            @Schema(description = "Pricing metadata.")
            ProviderCatalogPricing pricing,

            @Schema(description = "Model capabilities.")
            List<String> capabilities,

            @Schema(description = "Frontend display tags.")
            List<String> tags,

            @Schema(description = "Catalog status.", example = "ready")
            String status
    ) {
    }

    @Schema(description = "AI model pricing metadata.")
    public record ProviderCatalogPricing(
            @Schema(description = "Pricing unit.", example = "tokens")
            String unit,

            @Schema(description = "Input price per one million tokens in USD when configured.")
            BigDecimal inputUsdPerMillionTokens,

            @Schema(description = "Output price per one million tokens in USD when configured.")
            BigDecimal outputUsdPerMillionTokens,

            @Schema(description = "Short frontend pricing hint.", example = "external pricing not configured")
            String priceHint,

            @Schema(description = "Metadata source.", example = "backend-static-metadata")
            String source
    ) {
    }
}
