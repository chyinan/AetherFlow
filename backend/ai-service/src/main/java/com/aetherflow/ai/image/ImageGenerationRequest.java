package com.aetherflow.ai.image;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record ImageGenerationRequest(
        ImageProviderType provider,
        String mode,
        String prompt,
        String negativePrompt,
        Long seed,
        Integer steps,
        Double cfgScale,
        String sampler,
        String scheduler,
        Integer width,
        Integer height,
        Integer batchSize,
        Double denoiseStrength,
        String checkpoint,
        String vae,
        List<Map<String, Object>> lora,
        String sourceImageBase64,
        String sourceImageContentType,
        Map<String, Object> workflowJson,
        Map<String, Object> options,
        Duration timeout
) {

    public ImageGenerationRequest {
        mode = isBlank(mode) ? "txt2img" : mode;
        lora = copyListOfMaps(lora);
        workflowJson = copyMap(workflowJson);
        options = copyMap(options);
    }

    private static List<Map<String, Object>> copyListOfMaps(List<Map<String, Object>> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> copies = new ArrayList<>(values.size());
        for (Map<String, Object> value : values) {
            copies.add(copyMap(value));
        }
        return Collections.unmodifiableList(copies);
    }

    private static Map<String, Object> copyMap(Map<String, Object> value) {
        if (value == null || value.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(value));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
