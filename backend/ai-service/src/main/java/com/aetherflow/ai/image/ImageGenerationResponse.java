package com.aetherflow.ai.image;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record ImageGenerationResponse(
        String provider,
        String mode,
        List<GeneratedImagePayload> images,
        List<GeneratedMediaPayload> media,
        Map<String, Object> metadata
) {

    public ImageGenerationResponse {
        images = images == null || images.isEmpty() ? List.of() : List.copyOf(images);
        media = media == null || media.isEmpty() ? List.of() : List.copyOf(media);
        metadata = copyMap(metadata);
    }

    public ImageGenerationResponse(String provider, String mode, List<GeneratedImagePayload> images,
                                   Map<String, Object> metadata) {
        this(provider, mode, images, List.of(), metadata);
    }

    private static Map<String, Object> copyMap(Map<String, Object> value) {
        if (value == null || value.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(value));
    }
}
