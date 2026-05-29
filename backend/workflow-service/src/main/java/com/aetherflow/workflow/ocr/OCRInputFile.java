package com.aetherflow.workflow.ocr;

import java.util.Arrays;

public record OCRInputFile(
        String fileName,
        String contentType,
        byte[] content
) {

    public OCRInputFile {
        fileName = fileName == null || fileName.isBlank() ? "ocr-file" : fileName;
        contentType = contentType == null || contentType.isBlank() ? "application/octet-stream" : contentType;
        content = content == null ? new byte[0] : Arrays.copyOf(content, content.length);
    }

    @Override
    public byte[] content() {
        return Arrays.copyOf(content, content.length);
    }
}
