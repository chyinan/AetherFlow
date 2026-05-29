package com.aetherflow.workflow.ocr;

public record OCRRequest(
        OCRInputFile file,
        OCRNodeConfig config
) {
}
