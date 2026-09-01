package com.aetherflow.workflow.node.executor;

// pattern: Functional Core

import com.aetherflow.workflow.runtime.api.NodeResult;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

// pattern: Functional Core
public final class AiWorkflowNodeResultAdapter {

    private AiWorkflowNodeResultAdapter() {
    }

    public static NodeResult adapt(String nodeType, Map<String, Object> output) {
        Map<String, Object> safeOutput = withoutNullValues(output);
        Map<String, Object> variables = new LinkedHashMap<>();
        copyCommonVariables(safeOutput, variables);
        String normalizedType = normalize(nodeType);
        String branchKey = null;
        switch (normalizedType) {
            case "WHISPER" -> {
                copy(safeOutput, variables, "text", "transcription");
                copy(safeOutput, variables, "srtFileId", "srtFileId");
                copy(safeOutput, variables, "srtObjectKey", "srtObjectKey");
                copy(safeOutput, variables, "srtUrl", "srtUrl");
                copy(safeOutput, variables, "durationSeconds", "durationSeconds");
            }
            case "FFMPEG" -> {
                // MEDIA artifacts are the hand-off contract for FFmpeg -> Whisper/OCR
                // chains. Keep descriptive aliases and publish generic file variables
                // so downstream nodes do not need provider-specific knowledge.
                copy(safeOutput, variables, "mediaFileId", "mediaFileId");
                copy(safeOutput, variables, "mediaUrl", "mediaUrl");
                copy(safeOutput, variables, "mediaObjectKey", "mediaObjectKey");
                copy(safeOutput, variables, "mediaFileId", "fileId");
                copy(safeOutput, variables, "mediaUrl", "fileUrl");
                copy(safeOutput, variables, "mediaObjectKey", "fileObjectKey");
            }
            case "TRANSLATE" -> copy(safeOutput, variables, "translatedText", "translation");
            case "SUMMARY" -> copy(safeOutput, variables, "summary", "summary");
            case "AGENT" -> {
                putIfPresent(variables, "plan", first(safeOutput, "jsonData", "completionText"));
                copy(safeOutput, variables, "completionText", "actionLog");
            }
            case "QUESTION_UNDERSTAND" -> {
                Object intent = first(safeOutput, "jsonData", "completionText");
                putIfPresent(variables, "intent", intent);
                putIfPresent(variables, "intentJson", intent);
            }
            case "PARAMETER_EXTRACTOR" -> {
                Map<String, Object> params = objectMap(safeOutput.get("jsonData"));
                variables.put("params", params);
                variables.put("paramsJson", params);
            }
            case "QUESTION_CLASSIFIER" -> {
                Map<String, Object> routeJson = objectMap(safeOutput.get("jsonData"));
                Object route = routeJson.get("route");
                if (route == null) {
                    route = safeOutput.getOrDefault("completionText", "");
                }
                variables.put("route", route);
                variables.put("routeJson", routeJson.isEmpty() ? Map.of("route", route) : routeJson);
                branchKey = String.valueOf(route);
            }
            default -> {
                // Common LLM variables are sufficient for node types without dedicated derived outputs.
            }
        }
        NodeResult result = NodeResult.success(safeOutput, variables);
        return branchKey == null ? result : result.withBranchKey(branchKey);
    }

    private static void copyCommonVariables(Map<String, Object> output, Map<String, Object> variables) {
        copy(output, variables, "completionText", "completionText");
        copy(output, variables, "completionText", "completion");
        copy(output, variables, "translatedText", "translatedText");
        copy(output, variables, "jsonData", "jsonData");
        copy(output, variables, "provider", "provider");
        copy(output, variables, "model", "model");
    }

    private static void copy(Map<String, Object> output,
                             Map<String, Object> variables,
                             String outputKey,
                             String variableName) {
        putIfPresent(variables, variableName, output.get(outputKey));
    }

    private static void putIfPresent(Map<String, Object> variables, String variableName, Object value) {
        if (value != null) {
            variables.put(variableName, value);
        }
    }

    private static Object first(Map<String, Object> output, String firstKey, String fallbackKey) {
        Object first = output.get(firstKey);
        return first == null ? output.get(fallbackKey) : first;
    }

    private static Map<String, Object> withoutNullValues(Map<String, Object> output) {
        if (output == null || output.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> safe = new LinkedHashMap<>();
        output.forEach((key, value) -> {
            if (key != null && value != null) {
                safe.put(key, value);
            }
        });
        return Map.copyOf(safe);
    }

    private static Map<String, Object> objectMap(Object value) {
        if (!(value instanceof Map<?, ?> source)) {
            return Map.of();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        source.forEach((key, item) -> {
            if (key != null && item != null) {
                result.put(String.valueOf(key), item);
            }
        });
        return Map.copyOf(result);
    }

    private static String normalize(String nodeType) {
        return nodeType == null ? "" : nodeType.trim().toUpperCase(Locale.ROOT);
    }
}
