package com.aetherflow.workflow.ingestion.url;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

public final class UrlIngestionDtos {

    private UrlIngestionDtos() {
    }

    @Data
    public static class UrlFetchRequest {
        @NotBlank
        @Size(max = 2048)
        private String url;
        private Integer maxChars;
    }

    public record UrlFetchResponse(
            String url,
            String title,
            String text,
            Integer chars,
            String contentType,
            Integer statusCode
    ) {
    }
}
