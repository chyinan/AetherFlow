package com.aetherflow.workflow.node.validation;

// pattern: Functional Core

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.mapping.StructuredDataMapper;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogItem;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.node.catalog.WorkflowNodeConfigSchema;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

// pattern: Functional Core
/**
 * Validates persisted node configuration against the same catalog schema used
 * by the designer. This keeps malformed definitions out of the runtime queue.
 */
public final class WorkflowNodeConfigValidator {

    private static final ObjectMapper JSON = new ObjectMapper();

    private WorkflowNodeConfigValidator() {
    }

    public static List<String> validate(WorkflowNodeDTO node,
                                        List<WorkflowNodeCatalogItem> catalog) {
        if (node == null || catalog == null) {
            return List.of();
        }
        WorkflowNodeCatalogItem item = catalog.stream()
                .filter(candidate -> normalize(candidate.type()).equals(normalize(node.getNodeType())))
                .findFirst()
                .orElse(null);
        if (item == null) {
            return List.of();
        }
        Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
        List<String> violations = new ArrayList<>();
        for (WorkflowNodeConfigSchema field : item.configSchema()) {
            Object value = configuredValue(item.type(), field.name(), config);
            String prefix = prefix(node, item.type());
            if (field.required() && isBlank(value)) {
                violations.add(prefix + "config field '" + field.name() + "' is required");
                continue;
            }
            if (value == null || !isFieldType(item.type(), field, value)) {
                if (value != null) {
                    violations.add(prefix + "config field '" + field.name() + "' must be " + field.type());
                }
                continue;
            }
            if (!runtimeConnectionOption(item.type(), field.name(), config)
                    && !field.options().isEmpty() && value instanceof String selected
                    && field.options().stream().noneMatch(option -> option.equalsIgnoreCase(selected.trim()))) {
                violations.add(prefix + "config field '" + field.name() + "' must be one of " + field.options());
            }
        }
        violations.addAll(validateCrossFieldRules(node, config));
        return List.copyOf(violations);
    }

    private static boolean isFieldType(String nodeType, WorkflowNodeConfigSchema field, Object value) {
        // 图像工作流导入与 AI 执行使用对象；保留旧目录文本编辑格式的兼容性。
        // 仅放行这两个节点的 workflowJson 对象，不改变其他 STRING 字段的校验。
        if (("IMAGE_GENERATION".equals(normalize(nodeType)) || "UPSCALE".equals(normalize(nodeType)))
                && "workflowJson".equals(field.name()) && "STRING".equals(normalize(field.type()))
                && value instanceof Map<?, ?>) {
            return true;
        }
        return isType(field.type(), value);
    }

    private static boolean runtimeConnectionOption(String nodeType, String fieldName, Map<String, Object> config) {
        // 连接的动态可选项由 AI Service 在执行前按真实服务目录校验。
        return ("IMAGE_GENERATION".equals(nodeType) || "UPSCALE".equals(nodeType))
                && !isBlank(config.get("connectionId"))
                && List.of("sampler", "scheduler", "upscaler").contains(fieldName);
    }

    private static List<String> validateCrossFieldRules(WorkflowNodeDTO node, Map<String, Object> config) {
        String type = normalize(node.getNodeType());
        String prefix = prefix(node, type);
        List<String> violations = new ArrayList<>();
        if ("ITERATION".equals(type) || "LOOP".equals(type)) {
            LoopBindingNames.validate(type, config).forEach(message -> violations.add(prefix + message));
            Object maximum = config.get("maxIterations");
            if (maximum instanceof Number value && (value.doubleValue() < 0 || value.doubleValue() > 1000 || value.doubleValue() != value.intValue()))
                violations.add(prefix + "maxIterations 必须是 0 至 1000 的整数");
            Object concurrency = config.get("concurrency");
            if (concurrency instanceof Number value && (value.doubleValue() < 1 || value.doubleValue() > 8 || value.doubleValue() != value.intValue()))
                violations.add(prefix + "concurrency 必须是 1 至 8 的整数");
        }
        if ("KNOWLEDGE_RETRIEVAL".equals(type)) {
            Object datasetId = first(config, "datasetId", "dataset", "vectorCollection");
            if (!isBlank(datasetId) && !isPositiveLong(datasetId)) {
                violations.add(prefix + "datasetId must be a positive number");
            }
            Object metadataFilter = config.get("metadataFilter");
            if (!isBlank(metadataFilter)) {
                if (metadataFilter instanceof Map<?, ?>) {
                    // Already a JSON object after deserialization.
                } else if (metadataFilter instanceof String text && !isJsonObject(text)) {
                    violations.add(prefix + "metadataFilter must be a JSON object");
                }
            }
            Object topK = config.get("topK");
            if (topK instanceof Number number && (number.intValue() < 1 || number.intValue() > 50)) {
                violations.add(prefix + "topK must be between 1 and 50");
            }
        }
        if ("IMAGE_GENERATION".equals(type)
                && isBlank(config.get("prompt")) && isBlank(config.get("promptVariable"))) {
            violations.add(prefix + "one of prompt or promptVariable is required");
        }
        if ("SUBWORKFLOW".equals(type)) {
            try { com.aetherflow.workflow.subworkflow.SubworkflowConfig.from(config); }
            catch (IllegalArgumentException exception) { violations.add(prefix + exception.getMessage()); }
        }
        switch (type) {
            case "UPLOAD", "OCR" -> requireAny(violations, prefix, config,
                    "fileId", "fileIdVariable");
            case "FFMPEG" -> requireAny(violations, prefix, config,
                    "fileUrl", "fileUrlVariable");
            case "WHISPER" -> requireAny(violations, prefix, config,
                    "fileUrl", "fileUrlVariable", "fileId", "fileIdVariable");
            case "TEMPLATE_TRANSFORM" -> {
                if ("structured".equals(config.get("transformMode"))) {
                    try {
                        StructuredDataMapper.validate(config.get("mapping"));
                    } catch (IllegalArgumentException exception) {
                        violations.add(prefix + exception.getMessage());
                    }
                } else if (isBlank(config.get("template"))) {
                    violations.add(prefix + "config field 'template' is required");
                }
            }
            case "CODE" -> {
                if (isBlank(config.get("code"))) {
                    violations.add(prefix + "config field 'code' is required");
                }
            }
            case "LLM" -> requireAny(violations, prefix, config,
                    "prompt", "promptVariable", "context");
            case "SUMMARY" -> requireAny(violations, prefix, config,
                    "text", "textVariable");
            case "EMBEDDING" -> requireAny(violations, prefix, config,
                    "text", "textVariable");
            case "HTTP_REQUEST" -> validateHttpRequest(violations, prefix, config);
            case "URL_FETCH" -> requireAny(violations, prefix, config,
                    "url", "urlVariable");
            case "TRANSLATE" -> requireAny(violations, prefix, config,
                    "text", "textVariable");
            case "AGENT" -> requireAny(violations, prefix, config,
                    "task", "taskVariable");
            case "QUESTION_UNDERSTAND", "QUESTION_CLASSIFIER", "PARAMETER_EXTRACTOR" -> requireAny(
                    violations, prefix, config, "input", "inputVariable");
            case "KNOWLEDGE_RETRIEVAL" -> requireAny(violations, prefix, config,
                    "queryText", "queryVariable");
            default -> {
                // Nodes with no external payload keep their catalog-only rules.
            }
        }
        config.forEach((key, value) -> {
            if (key != null && key.endsWith("Variable") && value != null
                    && !String.valueOf(value).trim().matches("[A-Za-z_][A-Za-z0-9_]*")) {
                violations.add(prefix + "config field '" + key + "' must be a valid variable name");
            }
        });
        return List.copyOf(violations);
    }

    private static void validateHttpRequest(List<String> violations, String prefix, Map<String, Object> config) {
        requireAny(violations, prefix, config, "url", "urlVariable");
        Object body = first(config, "bodyJson", "bodyVariable");
        if (!isBlank(config.get("bodyJson")) && !isBlank(config.get("bodyVariable"))) {
            violations.add(prefix + "bodyJson 与 bodyVariable 只能选择一个");
        }
        String method = normalize(String.valueOf(config.getOrDefault("method", "GET")));
        if (body != null && List.of("GET", "HEAD").contains(method)) {
            violations.add(prefix + "GET/HEAD 不支持 JSON 请求体");
        }
        if (config.get("bodyJson") instanceof String text && !text.isBlank()) {
            try {
                if (JSON.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(text) == null) {
                    violations.add(prefix + "bodyJson 必须是有效 JSON");
                }
            } catch (Exception exception) {
                violations.add(prefix + "bodyJson 必须是有效 JSON");
            }
        }
        if ("BRANCH".equals(normalize(String.valueOf(config.get("errorStrategy"))))) {
            if (!(config.get("branches") instanceof Map<?, ?> branches)
                    || !(branches.get("success") instanceof String success) || success.isBlank()
                    || !(branches.get("error") instanceof String error) || error.isBlank()) {
                violations.add(prefix + "BRANCH 策略必须连接 success 和 error 分支");
            }
        }
    }

    private static void requireAny(List<String> violations,
                                   String prefix,
                                   Map<String, Object> config,
                                   String... names) {
        if (first(config, names) == null) {
            violations.add(prefix + "one of " + String.join(", ", names) + " is required");
        }
    }

    private static boolean isPositiveLong(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return false;
        }
        try {
            return Long.parseLong(String.valueOf(value).trim()) > 0;
        } catch (NumberFormatException exception) {
            return false;
        }
    }

    private static boolean isJsonObject(String value) {
        try {
            JsonNode node = JSON.readTree(value);
            return node != null && node.isObject();
        } catch (Exception exception) {
            return false;
        }
    }

    private static Object configuredValue(String nodeType, String fieldName, Map<String, Object> config) {
        Object direct = config.get(fieldName);
        if (!isBlank(direct)) {
            return direct;
        }
        if ("KNOWLEDGE_RETRIEVAL".equalsIgnoreCase(nodeType) && "datasetId".equals(fieldName)) {
            return first(config, "dataset", "vectorCollection");
        }
        if ("IMAGE_GENERATION".equalsIgnoreCase(nodeType) && "prompt".equals(fieldName)) {
            return config.get("promptVariable");
        }
        return direct;
    }

    private static Object first(Map<String, Object> config, String... names) {
        for (String name : names) {
            Object value = config.get(name);
            if (!isBlank(value)) {
                return value;
            }
        }
        return null;
    }

    public static List<String> validateAll(List<WorkflowNodeDTO> nodes,
                                           WorkflowNodeCatalogService catalogService) {
        if (nodes == null || catalogService == null) {
            return List.of();
        }
        List<WorkflowNodeCatalogItem> catalog = catalogService.catalog();
        List<String> violations = new ArrayList<>();
        for (WorkflowNodeDTO node : NestedWorkflowDefinition.flatten(nodes)) {
            violations.addAll(validate(node, catalog));
        }
        return List.copyOf(violations);
    }

    private static boolean isType(String type, Object value) {
        return switch (normalize(type)) {
            case "STRING" -> value instanceof CharSequence;
            case "NUMBER" -> value instanceof Number;
            case "BOOLEAN" -> value instanceof Boolean;
            case "OBJECT" -> value instanceof Map<?, ?>;
            case "ARRAY" -> value instanceof Collection<?>;
            default -> true;
        };
    }

    private static boolean isBlank(Object value) {
        if (value == null) {
            return true;
        }
        if (value instanceof CharSequence text) {
            return text.toString().trim().isBlank();
        }
        if (value instanceof Collection<?> collection) {
            return collection.isEmpty();
        }
        return false;
    }

    private static String prefix(WorkflowNodeDTO node, String type) {
        String nodeId = node.getNodeId() == null || node.getNodeId().isBlank()
                ? "unknown"
                : node.getNodeId().trim();
        return "node " + nodeId + " (" + normalize(type) + "): ";
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }
}
