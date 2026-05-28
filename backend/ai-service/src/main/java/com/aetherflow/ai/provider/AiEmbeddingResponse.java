package com.aetherflow.ai.provider;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.Map;

@Schema(description = "AI provider embedding response.")
public record AiEmbeddingResponse(
        @Schema(description = "Provider that served the request.", example = "OPENAI")
        AiProviderType provider,

        @Schema(description = "Embedding model name.", example = "text-embedding-3-small")
        String model,

        @Schema(description = "Embedding vector.")
        List<Double> vector,

        @Schema(description = "Provider-specific metadata.", example = "{\"dimensions\":1536}")
        Map<String, Object> metadata
) {
}
