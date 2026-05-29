package com.aetherflow.workflow.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

public final class KnowledgeDtos {

    private KnowledgeDtos() {
    }

    @Data
    public static class DatasetCreateRequest {
        @NotBlank
        private String name;
        private String description;
        private String embeddingModel;
        private String retrievalMode;
        private String owner;
        private List<String> tags;
    }

    @Data
    public static class DocumentCreateRequest {
        private String sourceName;
        private String sourceType;
        private String fileId;
        private String content;
        private String mode;
        private Integer chunkSize;
        private Integer overlap;
    }

    @Data
    public static class RetrievalTestRequest {
        private String query;
        private Integer topK;
    }

    public record KnowledgeDatasetSummary(
            String id,
            String name,
            String description,
            String status,
            Integer documentCount,
            Integer processingDocumentCount,
            Integer chunkCount,
            Integer failedChunkCount,
            Integer hitRate,
            String embeddingModel,
            String retrievalMode,
            String owner,
            String updatedAt,
            List<String> tags
    ) {
    }

    public record KnowledgeDocumentSummary(
            String id,
            String datasetId,
            String name,
            String sourceType,
            String mode,
            Integer chars,
            Integer chunkCount,
            Integer recallCount,
            String uploadedAt,
            String status
    ) {
    }

    public record KnowledgeChunkSummary(
            String id,
            String datasetId,
            String documentId,
            String source,
            String preview,
            Integer tokens,
            Double score,
            String status
    ) {
    }

    public record RetrievalTestResponse(
            String datasetId,
            String query,
            List<KnowledgeChunkSummary> results
    ) {
    }
}
