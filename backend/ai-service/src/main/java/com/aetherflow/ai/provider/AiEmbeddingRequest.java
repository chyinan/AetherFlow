package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Duration;
import java.util.Map;

@Schema(description = "AI provider embedding request.")
public record AiEmbeddingRequest(
        @Schema(description = "Requested provider. When null, routing policy selects one.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Embedding model name.", example = "text-embedding-3-small")
        String model,

        @Schema(description = "Input text.", example = "meeting notes")
        String input,

        @Schema(description = "Provider-specific options.", example = "{\"dimensions\":1536}")
        Map<String, Object> options,

        @Schema(description = "Request timeout.", example = "PT60S")
        Duration timeout
) {
}
