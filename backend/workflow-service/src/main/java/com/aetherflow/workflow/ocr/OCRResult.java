package com.aetherflow.workflow.ocr;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Unified OCR result returned by OCR providers.")
public record OCRResult(
        @Schema(description = "Recognized text.", example = "Invoice total: 100.00")
        String text,

        @Schema(description = "Detected or configured OCR language.", example = "eng")
        String language,

        @Schema(description = "Provider confidence from 0 to 1 when available.", example = "0.91")
        double confidence,

        @Schema(description = "Recognized page count.", example = "1")
        int pageCount
) {
}
