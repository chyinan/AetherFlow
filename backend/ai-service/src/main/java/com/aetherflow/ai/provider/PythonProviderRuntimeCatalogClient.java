package com.aetherflow.ai.provider;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
public class PythonProviderRuntimeCatalogClient implements ProviderRuntimeCatalogClient {

    private final RestClient pythonAiRestClient;

    public PythonProviderRuntimeCatalogClient(@Qualifier("pythonAiRestClient") RestClient pythonAiRestClient) {
        this.pythonAiRestClient = pythonAiRestClient;
    }

    @Override
    public ProviderRuntimeCatalog catalog() {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> status = pythonAiRestClient.get()
                    .uri("/ai/status")
                    .retrieve()
                    .body(Map.class);
            if (status == null) {
                return ProviderRuntimeCatalog.empty();
            }
            List<AiProviderType> providers = providers(status.get("providers"));
            List<ProviderRuntimeCatalog.RuntimeModel> models = models(status.get("models"));
            return ProviderRuntimeCatalog.of(providers, models);
        } catch (RuntimeException exception) {
            log.warn("Failed to load runtime provider catalog from python ai-service", exception);
            return ProviderRuntimeCatalog.empty();
        }
    }

    private List<AiProviderType> providers(Object value) {
        if (!(value instanceof Collection<?> entries)) {
            return List.of();
        }
        List<AiProviderType> providers = new ArrayList<>();
        for (Object entry : entries) {
            providerType(String.valueOf(entry)).ifPresent(provider -> {
                if (!providers.contains(provider)) {
                    providers.add(provider);
                }
            });
        }
        return providers;
    }

    private List<ProviderRuntimeCatalog.RuntimeModel> models(Object value) {
        if (!(value instanceof Map<?, ?> modelsByProvider)) {
            return List.of();
        }
        List<ProviderRuntimeCatalog.RuntimeModel> models = new ArrayList<>();
        for (Map.Entry<?, ?> entry : modelsByProvider.entrySet()) {
            Optional<AiProviderType> provider = providerType(String.valueOf(entry.getKey()));
            if (provider.isEmpty() || !(entry.getValue() instanceof Collection<?> names)) {
                continue;
            }
            for (Object name : names) {
                String modelName = String.valueOf(name == null ? "" : name).trim();
                if (!modelName.isBlank()) {
                    models.add(new ProviderRuntimeCatalog.RuntimeModel(provider.get(), modelName));
                }
            }
        }
        return models;
    }

    private Optional<AiProviderType> providerType(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace('-', '_');
        try {
            return normalized.isBlank() ? Optional.empty() : Optional.of(AiProviderType.valueOf(normalized));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
