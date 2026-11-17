package com.aetherflow.ai.image;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** 图像工作流 Provider（例如 ComfyUI）返回的非图片文件。 */
public record GeneratedMediaPayload(
        String fileName,
        String contentType,
        String base64Data,
        Long size,
        Map<String, Object> metadata
) {

    public GeneratedMediaPayload {
        contentType = contentType == null || contentType.isBlank()
                ? "application/octet-stream"
                : contentType;
        metadata = copyMap(metadata);
    }

    private static Map<String, Object> copyMap(Map<String, Object> value) {
        if (value == null || value.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(value));
    }
}
