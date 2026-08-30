package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// pattern: Functional Core
@Schema(description = "Current executable AI workflow capabilities exposed by ai-service.")
public record AiWorkflowCapabilitiesDTO(
        @Schema(description = "Whether python-ai-service returned a healthy runtime status.")
        boolean runtimeReachable,

        @Schema(description = "Whether at least one configured chat provider has an executable model.")
        boolean llmExecutable,

        @Schema(description = "Whether Whisper and FFmpeg are both ready for transcription.")
        boolean whisperExecutable,

        @Schema(description = "Configured LLM provider names.")
        List<String> llmProviders,

        @Schema(description = "Enabled image generation provider names.")
        List<String> imageProviders,

        @Schema(description = "AI node types registered in ai-service.")
        List<String> supportedNodeTypes,

        @Schema(description = "AI node types that are executable in the current environment.")
        List<String> executableNodeTypes,

        @Schema(description = "Unavailable node type to actionable reason.")
        Map<String, String> unavailableReasons
) {

    public AiWorkflowCapabilitiesDTO {
        llmProviders = stableStrings(llmProviders);
        imageProviders = stableStrings(imageProviders);
        supportedNodeTypes = stableStrings(supportedNodeTypes);
        executableNodeTypes = stableStrings(executableNodeTypes);
        unavailableReasons = stableReasons(unavailableReasons);
    }

    private static List<String> stableStrings(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .sorted()
                .toList();
    }

    private static Map<String, String> stableReasons(Map<String, String> reasons) {
        if (reasons == null || reasons.isEmpty()) {
            return Map.of();
        }
        Map<String, String> copy = new LinkedHashMap<>();
        List<String> keys = new ArrayList<>(reasons.keySet());
        keys.stream()
                .filter(key -> key != null && !key.isBlank())
                .sorted()
                .forEach(key -> copy.put(key.trim(), reasons.get(key)));
        return Map.copyOf(copy);
    }
}
