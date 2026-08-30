package com.aetherflow.workflow.knowledge.dto;

// pattern: Functional Core

import com.aetherflow.workflow.knowledge.KnowledgeDocumentLimits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.Map;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.ANNOTATION_TYPE;
import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

public final class KnowledgeDtos {

    private KnowledgeDtos() {
    }

    @Documented
    @Constraint(validatedBy = DocumentSourcePresentValidator.class)
    @Target({TYPE, ANNOTATION_TYPE})
    @Retention(RUNTIME)
    public @interface DocumentSourcePresent {
        String message() default "knowledge document content or fileId is required";

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};
    }

    public static class DocumentSourcePresentValidator
            implements ConstraintValidator<DocumentSourcePresent, DocumentCreateRequest> {
        @Override
        public boolean isValid(DocumentCreateRequest request, ConstraintValidatorContext context) {
            if (request != null && ((request.getContent() != null && !request.getContent().isBlank())
                    || (request.getFileId() != null && !request.getFileId().isBlank()))) {
                return true;
            }
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
                    .addPropertyNode("content")
                    .addConstraintViolation();
            return false;
        }
    }

    @Data
    public static class DatasetCreateRequest {
        @NotBlank
        private String name;
        @Size(max = 128)
        private String idempotencyKey;
        private String description;
        private String embeddingModel;
        private String retrievalMode;
        private String owner;
        private List<String> tags;
    }

    @Data
    @DocumentSourcePresent
    public static class DocumentCreateRequest {
        @Size(max = 128)
        private String idempotencyKey;
        private String sourceName;
        private String sourceType;
        private String fileId;
        @Size(max = KnowledgeDocumentLimits.MAX_DOCUMENT_CHARS,
                message = "knowledge document content must not exceed 1000000 characters")
        private String content;
        private String mode;
        @Min(value = KnowledgeDocumentLimits.MIN_CHUNK_SIZE,
                message = "knowledge document chunkSize must be at least 64")
        @Max(value = KnowledgeDocumentLimits.MAX_CHUNK_SIZE,
                message = "knowledge document chunkSize must not exceed 16384")
        private Integer chunkSize;
        @Min(value = 0, message = "knowledge document overlap must be at least 0")
        @Max(value = KnowledgeDocumentLimits.MAX_OVERLAP,
                message = "knowledge document overlap must not exceed 4096")
        private Integer overlap;
        private String delimiter;
        private Boolean cleanSpaces;
        private Boolean cleanUrls;
        private Map<String, Object> metadata;
    }

    @Data
    public static class RetrievalTestRequest {
        private String query;
        private Integer topK;
        private String metadataFilter;
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
            String status,
            String errorMessage
    ) {
        public KnowledgeDocumentSummary(String id,
                                        String datasetId,
                                        String name,
                                        String sourceType,
                                        String mode,
                                        Integer chars,
                                        Integer chunkCount,
                                        Integer recallCount,
                                        String uploadedAt,
                                        String status) {
            this(id, datasetId, name, sourceType, mode, chars, chunkCount, recallCount,
                    uploadedAt, status, null);
        }
    }

    public record KnowledgeChunkSummary(
            String id,
            String datasetId,
            String documentId,
            String source,
            String preview,
            Integer tokens,
            Double score,
            String status,
            String chunkType,
            String parentChunkId,
            Map<String, Object> metadata
    ) {
        public KnowledgeChunkSummary(String id,
                                     String datasetId,
                                     String documentId,
                                     String source,
                                     String preview,
                                     Integer tokens,
                                     Double score,
                                     String status) {
            this(id, datasetId, documentId, source, preview, tokens, score, status, "general", null, Map.of());
        }
    }

    public record RetrievalTestResponse(
            String datasetId,
            String query,
            List<KnowledgeChunkSummary> results
    ) {
    }
}
