package com.aetherflow.workflow.ocr.metrics;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "OCR workflow node metrics snapshot.")
public record OCRMetricsSnapshot(
        @Schema(description = "Total OCR execution count including failures.", example = "128")
        long ocrCount,

        @Schema(description = "OCR failure count.", example = "3")
        long failCount,

        @Schema(description = "Average OCR execution duration in milliseconds.", example = "860")
        long averageDurationMs
) {
}
