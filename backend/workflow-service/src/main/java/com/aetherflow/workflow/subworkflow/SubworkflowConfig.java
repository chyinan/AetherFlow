package com.aetherflow.workflow.subworkflow;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/** 子流程边界只传递显式声明的映射，缺失源值必须明确失败。 */
public record SubworkflowConfig(long definitionId, int definitionVersion,
                                Map<String, String> inputMappings, Map<String, String> outputMappings) {
    public static SubworkflowConfig from(Map<String, Object> config) {
        if (config == null) throw new IllegalArgumentException("SUBWORKFLOW config is required");
        long definitionId = positiveInteger(config.get("definitionId"), "definitionId");
        long version = positiveInteger(config.get("definitionVersion"), "definitionVersion");
        if (version > Integer.MAX_VALUE) throw new IllegalArgumentException("definitionVersion is too large");
        return new SubworkflowConfig(definitionId, (int) version,
                mapping(config.get("inputMappings"), "inputMappings"),
                mapping(config.get("outputMappings"), "outputMappings"));
    }

    private static long positiveInteger(Object value, String field) {
        try {
            long parsed = new BigDecimal(String.valueOf(value)).longValueExact();
            if (parsed > 0) return parsed;
        } catch (RuntimeException ignored) { }
        throw new IllegalArgumentException(field + " must be a positive integer");
    }

    private static Map<String, String> mapping(Object value, String field) {
        if (!(value instanceof Map<?, ?> source) || source.size() > 100) {
            throw new IllegalArgumentException(field + " must be an object with at most 100 entries");
        }
        Map<String, String> result = new LinkedHashMap<>();
        source.forEach((key, item) -> {
            if (!(key instanceof String name) || !name.matches("[A-Za-z_][A-Za-z0-9_]{0,127}")
                    || name.startsWith("__") || name.equals("userId") || name.equals("username")) {
                throw new IllegalArgumentException(field + " has an invalid target variable");
            }
            if (!(item instanceof String path) || path.isBlank() || path.length() > 512) {
                throw new IllegalArgumentException(field + " source must be a variable path");
            }
            com.aetherflow.workflow.node.mapping.StructuredDataMapper.validatePath(path);
            result.put(name, path);
        });
        return Map.copyOf(result);
    }
}
