package com.aetherflow.workflow.embedding;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;

import java.util.Map;

public record EmbeddingNodeConfig(
        String provider,
        String model,
        int chunkSize,
        int overlap,
        String textVariable,
        String text,
        String vectorCollection
) {

    public static EmbeddingNodeConfig from(Map<String, Object> config, EmbeddingProperties properties) {
        Map<String, Object> safeConfig = config == null ? Map.of() : config;
        int chunkSize = intValue(safeConfig.get("chunkSize"), properties.getDefaultChunkSize());
        int overlap = intValue(safeConfig.get("overlap"), properties.getDefaultOverlap());
        validateChunkSettings(chunkSize, overlap);
        return new EmbeddingNodeConfig(
                stringValue(safeConfig.get("provider"), properties.getDefaultProvider()),
                stringValue(safeConfig.get("model"), properties.getDefaultModel()),
                chunkSize,
                overlap,
                stringValue(safeConfig.get("textVariable"), properties.getDefaultTextVariable()),
                stringValue(safeConfig.get("text"), ""),
                stringValue(safeConfig.get("vectorCollection"), properties.getDefaultVectorCollection())
        );
    }

    private static void validateChunkSettings(int chunkSize, int overlap) {
        if (chunkSize <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding chunkSize must be greater than 0");
        }
        if (overlap < 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding overlap must be greater than or equal to 0");
        }
        if (overlap >= chunkSize) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding overlap must be smaller than chunkSize");
        }
    }

    private static String stringValue(Object value, String defaultValue) {
        if (value == null || String.valueOf(value).isBlank()) {
            return defaultValue == null ? "" : defaultValue;
        }
        return String.valueOf(value).trim();
    }

    private static int intValue(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding numeric config is invalid");
        }
    }
}
