package com.aetherflow.workflow.embedding;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Workflow embedding result for one text chunk.")
public record EmbeddingResult(
        @Schema(description = "Embedding vector.", example = "[0.12, -0.03, 0.98]")
        List<Double> vector,

        @Schema(description = "Vector dimension.", example = "768")
        int dimension,

        @Schema(description = "Embedding model used.", example = "nomic-embed-text")
        String model,

        @Schema(description = "Zero-based chunk index.", example = "0")
        int chunkIndex
) {

    public EmbeddingResult {
        vector = vector == null ? List.of() : List.copyOf(vector);
    }
}
