package com.aetherflow.workflow.embedding.metrics;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Workflow embedding node metrics snapshot.")
public record EmbeddingMetricsSnapshot(
        @Schema(description = "Embedding node execution count.", example = "128")
        long embeddingCount,

        @Schema(description = "Embedding node failure count.", example = "3")
        long failCount,

        @Schema(description = "Average embedding execution duration in milliseconds.", example = "420")
        long averageDurationMs,

        @Schema(description = "Total vectors produced by embedding nodes.", example = "1024")
        long vectorCount,

        @Schema(description = "Most recent embedding model.", example = "nomic-embed-text")
        String currentModel
) {
}
