package com.aetherflow.workflow.embedding.store;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.Map;

@Schema(description = "Mock vector store record for workflow embedding demos.")
public record MockVectorRecord(
        String id,
        String collection,
        String workflowId,
        String nodeId,
        int chunkIndex,
        String text,
        List<Double> vector,
        int dimension,
        String model,
        Map<String, Object> metadata
) {

    public MockVectorRecord {
        vector = vector == null ? List.of() : List.copyOf(vector);
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
