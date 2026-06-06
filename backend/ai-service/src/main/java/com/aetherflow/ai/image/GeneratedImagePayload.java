package com.aetherflow.ai.image;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public record GeneratedImagePayload(
        String fileName,
        String contentType,
        String base64Data,
        Long size,
        Map<String, Object> metadata
) {

    public GeneratedImagePayload {
        contentType = contentType == null || contentType.isBlank() ? "image/png" : contentType;
        metadata = copyMap(metadata);
    }

    private static Map<String, Object> copyMap(Map<String, Object> value) {
        if (value == null || value.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(value));
    }
}
