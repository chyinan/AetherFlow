package com.aetherflow.workflow.document;

// pattern: Functional Core
import java.util.Arrays;
import java.io.ByteArrayInputStream;
import java.io.InputStream;

public record DocumentInput(
        String fileName,
        String contentType,
        byte[] content
) {
    public DocumentInput {
        fileName = fileName == null || fileName.isBlank() ? "document" : fileName.trim();
        contentType = contentType == null || contentType.isBlank()
                ? "application/octet-stream"
                : contentType.trim();
        content = content == null ? new byte[0] : Arrays.copyOf(content, content.length);
    }

    @Override
    public byte[] content() {
        return Arrays.copyOf(content, content.length);
    }

    public int size() {
        return content.length;
    }

    public InputStream openStream() {
        return new ByteArrayInputStream(content);
    }
}
