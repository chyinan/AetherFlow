package com.aetherflow.workflow.embedding;

import java.util.Map;

public record EmbeddingRequest(
        String text,
        String model,
        int chunkIndex,
        Map<String, Object> metadata
) {

    public EmbeddingRequest {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
