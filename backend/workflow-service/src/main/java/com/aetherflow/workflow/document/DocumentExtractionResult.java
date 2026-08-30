package com.aetherflow.workflow.document;

// pattern: Functional Core
public record DocumentExtractionResult(
        String text,
        String detectedContentType,
        int pageCount,
        String language,
        double confidence
) {
    public DocumentExtractionResult(String text, String detectedContentType, int pageCount) {
        this(text, detectedContentType, pageCount, "auto", text == null || text.isBlank() ? 0.0 : 1.0);
    }

    public DocumentExtractionResult {
        text = text == null ? "" : text.strip();
        detectedContentType = detectedContentType == null || detectedContentType.isBlank()
                ? "application/octet-stream"
                : detectedContentType;
        pageCount = Math.max(pageCount, text.isBlank() ? 0 : 1);
        language = language == null || language.isBlank() ? "auto" : language;
        confidence = Math.max(0.0, Math.min(confidence, 1.0));
    }
}
