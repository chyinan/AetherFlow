package com.aetherflow.workflow.node.executor;

// pattern: Functional Core

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

// pattern: Functional Core
public final class AiWorkflowNodeResultAdapter {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> OBJECT_TYPE = new TypeReference<>() {
    };
    private static final int SNIPPET_LIMIT = 160;

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
                copy(safeOutput, variables, "segments", "segments");
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
                // 模型经常只把 JSON 写进 completionText，这里统一走结构化取值入口；
                // 拿不到对象时按既有错误语义报可恢复错误，不产出空 params 掩盖问题。
                Map<String, Object> params = structuredResult(safeOutput).orElseThrow(() ->
                        unavailable("parameter extractor node ai output has no JSON object", safeOutput));
                variables.put("params", params);
                variables.put("paramsJson", params);
            }
            case "QUESTION_CLASSIFIER" -> {
                Map<String, Object> routeJson = structuredResult(safeOutput).orElse(Map.of());
                String route = routeValue(routeJson.get("route"));
                if (route == null) {
                    // 兼容模型直接返回裸标签（非 JSON）的历史行为。
                    route = bareRouteValue(safeOutput.get("completionText"));
                }
                if (route == null) {
                    throw unavailable("question classifier node ai output has no valid route", safeOutput);
                }
                variables.put("route", route);
                variables.put("routeJson", routeJson.isEmpty() ? Map.of("route", route) : routeJson);
                branchKey = route;
            }
            case "IMAGE_GENERATION", "UPSCALE" -> {
                copy(safeOutput, variables, "artifactFiles", "imageFiles");
                copy(safeOutput, variables, "imageFileIds", "imageFileIds");
                copy(safeOutput, variables, "imageObjectKeys", "imageObjectKeys");
                copy(safeOutput, variables, "imageUrls", "imageUrls");
            }
            default -> {
                // Common LLM variables are sufficient for node types without dedicated derived outputs.
            }
        }
        NodeResult result = NodeResult.success(safeOutput, variables);
        return branchKey == null ? result : result.withBranchKey(branchKey);
    }

    /**
     * 统一的结构化输出取值入口：优先 output.jsonData，其次 metadata.jsonData，
     * 最后解析 completionText（先剥 ```json 围栏与首尾空白）。只有顶层是 JSON 对象才被接受。
     *
     * @return 解析成功（含合法的空对象）时返回该对象，否则 {@link Optional#empty()}
     */
    public static Optional<Map<String, Object>> structuredResult(Map<String, Object> output) {
        Map<String, Object> safeOutput = withoutNullValues(output);
        Map<String, Object> jsonData = objectMap(safeOutput.get("jsonData"));
        if (!jsonData.isEmpty()) {
            return Optional.of(jsonData);
        }
        Map<String, Object> metadataJson = objectMap(objectMap(safeOutput.get("metadata")).get("jsonData"));
        if (!metadataJson.isEmpty()) {
            return Optional.of(metadataJson);
        }
        return parseObjectText(safeOutput.get("completionText"));
    }

    /** 便捷入口：拿不到可用结构化结果时返回空 Map（不区分"缺失"与"空对象"）。 */
    public static Map<String, Object> structured(Map<String, Object> output) {
        return structuredResult(output).orElse(Map.of());
    }

    private static Optional<Map<String, Object>> parseObjectText(Object text) {
        if (!(text instanceof CharSequence sequence)) {
            return Optional.empty();
        }
        String candidate = stripCodeFence(sequence.toString()).trim();
        // 只接受对象字面量：裸标签、数组、标量都交给调用方按各自契约处理。
        if (!candidate.startsWith("{")) {
            return Optional.empty();
        }
        try {
            JsonNode node = JSON.readTree(candidate);
            if (node == null || !node.isObject()) {
                return Optional.empty();
            }
            Map<String, Object> parsed = JSON.convertValue(node, OBJECT_TYPE);
            if (parsed == null) {
                return Optional.empty();
            }
            return Optional.of(Collections.unmodifiableMap(new LinkedHashMap<>(parsed)));
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    private static String stripCodeFence(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (!trimmed.startsWith("```")) {
            return trimmed;
        }
        String withoutOpening = trimmed.substring(3);
        // 去掉 ```json / ```JSON 这类语言标记
        int firstLineBreak = withoutOpening.indexOf('\n');
        if (firstLineBreak >= 0) {
            String languageTag = withoutOpening.substring(0, firstLineBreak).trim();
            if (languageTag.isEmpty() || languageTag.matches("[A-Za-z0-9_+-]+")) {
                withoutOpening = withoutOpening.substring(firstLineBreak + 1);
            }
        }
        int closing = withoutOpening.lastIndexOf("```");
        return closing >= 0 ? withoutOpening.substring(0, closing) : withoutOpening;
    }

    private static String routeValue(Object value) {
        if (value instanceof Map<?, ?> || value instanceof Iterable<?>) {
            return null;
        }
        if (value == null) {
            return null;
        }
        String route = String.valueOf(value).trim();
        return route.isEmpty() ? null : route;
    }

    /**
     * 裸标签兼容：completionText 不是 JSON 对象时（例如模型直接回 "billing"），
     * 才把整段文本当作分支标签；看起来像 JSON 的坏文本不能当标签用。
     */
    private static String bareRouteValue(Object completionText) {
        if (!(completionText instanceof CharSequence sequence)) {
            return null;
        }
        String candidate = sequence.toString().trim();
        if (candidate.isEmpty() || candidate.startsWith("{") || candidate.startsWith("[") || candidate.startsWith("`")) {
            return null;
        }
        return candidate;
    }

    private static BusinessException unavailable(String message, Map<String, Object> output) {
        return new BusinessException(ResultCode.SERVICE_UNAVAILABLE, message + " (completionText=" + snippet(output) + ")");
    }

    private static String snippet(Map<String, Object> output) {
        Object completionText = output.get("completionText");
        String text = completionText == null ? "" : String.valueOf(completionText).replaceAll("\\s+", " ").trim();
        return text.length() <= SNIPPET_LIMIT ? text : text.substring(0, SNIPPET_LIMIT) + "...";
    }

    private static void copyCommonVariables(Map<String, Object> output, Map<String, Object> variables) {        copy(output, variables, "completionText", "completionText");
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
