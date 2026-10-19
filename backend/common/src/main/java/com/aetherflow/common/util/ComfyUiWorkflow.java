package com.aetherflow.common.util;

import java.util.*;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/** 只检查格式与显式绑定，不模拟插件或执行图。 */
public final class ComfyUiWorkflow {
    private static final ObjectMapper JSON = new ObjectMapper();
    public enum Format { UI, API, INVALID }
    public static final String UI_GUIDANCE = "这是 ComfyUI 界面工作流，原图已保留。请在原有 ComfyUI 中导出 API 格式 JSON，再载入执行图；当前未提供通用 UI→API 编译器。";
    public static final Set<String> PARAMETERS = Set.of("prompt", "negativePrompt", "seed", "steps", "cfgScale", "sampler", "scheduler", "width", "height", "batchSize", "denoiseStrength", "checkpoint", "vae", "sourceImage");
    private ComfyUiWorkflow() {}
    /** 对象、合法 JSON 文本和旧别名使用同一个执行图边界，解析失败不能退回普通生图。 */
    public static Map<String, Object> decodeGraph(Object value) {
        if (value == null) return Map.of();
        if (value instanceof Map<?, ?>) return map(value);
        if (value instanceof String text) {
            try {
                Object parsed = JSON.readerFor(Object.class).with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(text);
                if (parsed instanceof Map<?, ?>) return map(parsed);
            } catch (Exception ignored) { }
        }
        throw new IllegalArgumentException("ComfyUI 执行图必须是 JSON 对象或合法对象 JSON 文本，请重新载入 API 格式");
    }
    public static Map<String, Object> executionGraph(Map<String, Object> config) {
        return decodeGraph(config.get("workflowJson") != null ? config.get("workflowJson") : config.get("workflow"));
    }
    /** 既有导入标记是摘要变量模式；普通 PROMPT 仍要求正向文本。 */
    public static boolean isPromptSummary(Map<String, Object> config) {
        return "comfyui-import".equals(config.get("stylePreset"));
    }
    public static Map<String, Object> map(Object value) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (value instanceof Map<?, ?> source) source.forEach((key, item) -> result.put(String.valueOf(key), item));
        return result;
    }
    public static Format format(Map<String, Object> graph) {
        if (graph == null || graph.isEmpty()) return Format.INVALID;
        if (graph.get("nodes") instanceof List<?> nodes) {
            boolean mixed = graph.values().stream().anyMatch(value -> value instanceof Map<?, ?> node && node.containsKey("class_type"));
            return !mixed && !nodes.isEmpty() && nodes.stream().allMatch(value -> value instanceof Map<?, ?> node
                    && node.get("id") != null && node.get("type") instanceof String type && !type.isBlank())
                    && nodes.stream().map(value -> String.valueOf(((Map<?, ?>)value).get("id"))).distinct().count() == nodes.size() ? Format.UI : Format.INVALID;
        }
        return graph.values().stream().allMatch(value -> value instanceof Map<?, ?> node
                && node.get("class_type") instanceof String type && !type.isBlank()
                && (!node.containsKey("inputs") || node.get("inputs") instanceof Map<?, ?>)) ? Format.API : Format.INVALID;
    }
    public static void requireApi(Map<String, Object> graph) {
        Format format = format(graph);
        if (format == Format.UI) throw new IllegalArgumentException(UI_GUIDANCE);
        if (format != Format.API) throw new IllegalArgumentException("ComfyUI 执行图必须是按节点 ID 索引、含 class_type 和 inputs 的 API JSON；请重新导出 API 格式。");
    }
    public static List<String> apiNodeTypes(Map<String, Object> graph) {
        requireApi(graph);
        return graph.values().stream().map(value -> String.valueOf(((Map<?, ?>) value).get("class_type"))).distinct().toList();
    }
    public record Binding(String nodeId, String inputName, String parameter) {}
    public static List<Binding> bindings(Object value, Map<String, Object> graph) {
        if (value == null) return List.of();
        if (!(value instanceof List<?> entries)) throw new IllegalArgumentException("workflowBindings 必须是数组");
        List<Binding> result = new ArrayList<>();
        Set<List<String>> targets = new HashSet<>();
        for (Object entry : entries) {
            Map<String, Object> item = map(entry);
            String nodeId = text(item.get("nodeId")), inputName = text(item.get("inputName")), parameter = text(item.get("parameter"));
            if (nodeId.isBlank() || inputName.isBlank() || !PARAMETERS.contains(parameter)) throw new IllegalArgumentException("绑定须指定 nodeId、inputName 和支持的 parameter");
            if (!map(map(graph.get(nodeId)).get("inputs")).containsKey(inputName)) throw new IllegalArgumentException("绑定目标不存在：" + nodeId + "." + inputName + "；请重新选择执行图中的输入");
            if (!targets.add(List.of(nodeId, inputName))) throw new IllegalArgumentException("重复绑定目标：" + nodeId + "." + inputName);
            result.add(new Binding(nodeId, inputName, parameter));
        }
        return List.copyOf(result);
    }
    private static String text(Object value) { return value instanceof String text ? text : ""; }
}
