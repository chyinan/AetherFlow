package com.aetherflow.ai.provider;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

// pattern: Functional Core
public final class ProviderRuntimeCatalogMapper {

    private ProviderRuntimeCatalogMapper() {
    }

    public static ProviderRuntimeCatalog fromStatus(Map<String, Object> status) {
        if (!isRuntimeUp(status)) {
            return ProviderRuntimeCatalog.empty();
        }
        return ProviderRuntimeCatalog.status(
                providers(status.get("providers")),
                models(status.get("models")),
                true,
                booleanValue(status.get("llmEnabled")),
                booleanValue(status.get("whisperEnabled")),
                booleanValue(status.get("whisperRuntimeReady")),
                booleanValue(status.get("ffmpegAvailable"))
        );
    }

    private static boolean isRuntimeUp(Map<String, Object> status) {
        if (status == null || status.isEmpty()) {
            return false;
        }
        Object value = status.get("status");
        return value != null && "UP".equalsIgnoreCase(String.valueOf(value).trim());
    }

    private static boolean booleanValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        return value != null && Boolean.parseBoolean(String.valueOf(value).trim());
    }

    private static List<AiProviderType> providers(Object value) {
        if (!(value instanceof Collection<?> entries)) {
            return List.of();
        }
        List<AiProviderType> providers = new ArrayList<>();
        for (Object entry : entries) {
            providerType(entry).ifPresent(provider -> {
                if (!providers.contains(provider)) {
                    providers.add(provider);
                }
            });
        }
        return List.copyOf(providers);
    }

    private static List<ProviderRuntimeCatalog.RuntimeModel> models(Object value) {
        if (!(value instanceof Map<?, ?> modelsByProvider)) {
            return List.of();
        }
        List<ProviderRuntimeCatalog.RuntimeModel> models = new ArrayList<>();
        for (Map.Entry<?, ?> entry : modelsByProvider.entrySet()) {
            Optional<AiProviderType> provider = providerType(entry.getKey());
            if (provider.isEmpty() || !(entry.getValue() instanceof Collection<?> names)) {
                continue;
            }
            for (Object name : names) {
                String modelName = name == null ? "" : String.valueOf(name).trim();
                if (!modelName.isBlank()) {
                    models.add(new ProviderRuntimeCatalog.RuntimeModel(provider.get(), modelName));
                }
            }
        }
        return List.copyOf(models);
    }

    private static Optional<AiProviderType> providerType(Object value) {
        String normalized = value == null
                ? ""
                : String.valueOf(value).trim().toUpperCase(Locale.ROOT).replace('-', '_');
        try {
            return normalized.isBlank() ? Optional.empty() : Optional.of(AiProviderType.valueOf(normalized));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
