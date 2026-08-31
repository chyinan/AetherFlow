package com.aetherflow.workflow.node.validation;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogItem;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.node.catalog.WorkflowNodeConfigSchema;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// pattern: Functional Core
/**
 * Validates persisted node configuration against the same catalog schema used
 * by the designer. This keeps malformed definitions out of the runtime queue.
 */
public final class WorkflowNodeConfigValidator {

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
            if (value == null || !isType(field.type(), value)) {
                if (value != null) {
                    violations.add(prefix + "config field '" + field.name() + "' must be " + field.type());
                }
                continue;
            }
            if (!field.options().isEmpty() && value instanceof String selected
                    && field.options().stream().noneMatch(option -> option.equalsIgnoreCase(selected.trim()))) {
                violations.add(prefix + "config field '" + field.name() + "' must be one of " + field.options());
            }
        }
        return List.copyOf(violations);
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
        for (WorkflowNodeDTO node : nodes) {
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
