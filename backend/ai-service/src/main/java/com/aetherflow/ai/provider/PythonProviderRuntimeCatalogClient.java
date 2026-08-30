package com.aetherflow.ai.provider;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Slf4j
@Service
// pattern: Imperative Shell
public class PythonProviderRuntimeCatalogClient implements ProviderRuntimeCatalogClient {

    private final RestClient pythonAiRestClient;

    public PythonProviderRuntimeCatalogClient(@Qualifier("pythonAiStatusRestClient") RestClient pythonAiRestClient) {
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
            return ProviderRuntimeCatalogMapper.fromStatus(status);
        } catch (RuntimeException exception) {
            log.warn("Failed to load runtime provider catalog from python ai-service", exception);
            return ProviderRuntimeCatalog.empty();
        }
    }

}
