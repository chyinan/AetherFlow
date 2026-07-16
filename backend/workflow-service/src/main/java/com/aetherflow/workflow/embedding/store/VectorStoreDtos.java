package com.aetherflow.workflow.embedding.store;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

public final class VectorStoreDtos {

    private VectorStoreDtos() {
    }

    @Data
    public static class VectorStoreConfigRequest {
        private boolean enabled = true;
        @NotBlank
        private String provider = "qdrant";
        @NotBlank
        @Size(max = 1024)
        private String baseUrl;
        @Size(max = 4096)
        private String apiKey;
        @NotBlank
        @Size(max = 255)
        private String collection = "workflow-embeddings";
    }

    public record VectorStoreConfigResponse(
            String provider,
            boolean enabled,
            String status,
            String baseUrl,
            String collection,
            boolean apiKeyConfigured
    ) {
    }

    public record VectorStoreTestResponse(
            boolean success,
            String message,
            String provider,
            String baseUrl,
            String collection
    ) {
    }
}
