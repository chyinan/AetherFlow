package com.aetherflow.workflow.ocr;

import com.aetherflow.workflow.ocr.config.OCRProperties;

import java.util.Map;

public record OCRNodeConfig(
        String language,
        boolean enableTable,
        boolean enableLayout,
        boolean mock,
        String provider
) {

    public static OCRNodeConfig from(Map<String, Object> config, OCRProperties properties) {
        Map<String, Object> safeConfig = config == null ? Map.of() : config;
        return new OCRNodeConfig(
                stringValue(safeConfig.get("language"), properties.getDefaultLanguage()),
                booleanValue(safeConfig.get("enableTable"), false),
                booleanValue(safeConfig.get("enableLayout"), false),
                booleanValue(safeConfig.get("mock"), properties.isMock()),
                stringValue(safeConfig.get("provider"), properties.getDefaultProvider())
        );
    }

    private static String stringValue(Object value, String defaultValue) {
        if (value == null || String.valueOf(value).isBlank()) {
            return defaultValue == null ? "" : defaultValue;
        }
        return String.valueOf(value).trim();
    }

    private static boolean booleanValue(Object value, boolean defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        return Boolean.parseBoolean(String.valueOf(value));
    }
}
