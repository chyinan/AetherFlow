package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.runtime.api.WorkflowContext;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class NodeValueSupport {

    private NodeValueSupport() {
    }

    static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    static String stringValue(Object value, String fallback) {
        String normalized = stringValue(value).trim();
        return normalized.isEmpty() ? fallback : normalized;
    }

    static boolean booleanValue(Object value, boolean fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        return Boolean.parseBoolean(String.valueOf(value));
    }

    static int intValue(Object value, int fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        try {
            return new BigDecimal(String.valueOf(value)).intValue();
        } catch (RuntimeException exception) {
            return fallback;
        }
    }

    static double doubleValue(Object value, double fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        try {
            return new BigDecimal(String.valueOf(value)).doubleValue();
        } catch (RuntimeException exception) {
            return fallback;
        }
    }

    static Object valueFromConfigOrVariable(Map<String, Object> config,
                                            WorkflowContext context,
                                            String valueKey,
                                            String variableKey,
                                            String defaultVariable) {
        Object configured = config.get(valueKey);
        if (configured != null && !String.valueOf(configured).isBlank()) {
            return configured;
        }
        String variableName = stringValue(config.get(variableKey), defaultVariable);
        if (!variableName.isBlank()) {
            return context.variables().get(variableName);
        }
        return null;
    }

    static List<Object> listValue(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof Collection<?> collection) {
            return new ArrayList<>(collection);
        }
        String text = String.valueOf(value);
        if (text.isBlank()) {
            return List.of();
        }
        List<Object> values = new ArrayList<>();
        for (String part : text.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                values.add(trimmed);
            }
        }
        return values;
    }

    static List<String> stringList(Object value) {
        return listValue(value).stream()
                .map(String::valueOf)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .toList();
    }

    static Map<String, Object> objectMap(Object value) {
        if (!(value instanceof Map<?, ?> source)) {
            return Map.of();
        }
        Map<String, Object> target = new LinkedHashMap<>();
        source.forEach((key, item) -> target.put(String.valueOf(key), item));
        return target;
    }

    static void putIfPresent(Map<String, Object> target, String key, Object value) {
        if (value != null && !String.valueOf(value).isBlank()) {
            target.put(key, value);
        }
    }

    static String renderTemplate(String template, Map<String, Object> variables) {
        String rendered = template == null ? "" : template;
        for (Map.Entry<String, Object> entry : variables.entrySet()) {
            String placeholder = "{{ " + entry.getKey() + " }}";
            String compactPlaceholder = "{{" + entry.getKey() + "}}";
            String value = entry.getValue() == null ? "" : String.valueOf(entry.getValue());
            rendered = rendered.replace(placeholder, value).replace(compactPlaceholder, value);
        }
        return rendered;
    }
}
