package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.PythonAiProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Slf4j
@Service
public class PythonProviderRuntimeConfigClient implements ProviderRuntimeConfigClient {

    private final RestClient pythonAiRestClient;
    private final PythonAiProperties properties;

    public PythonProviderRuntimeConfigClient(@Qualifier("pythonAiRestClient") RestClient pythonAiRestClient,
                                             PythonAiProperties properties) {
        this.pythonAiRestClient = pythonAiRestClient;
        this.properties = properties;
    }

    @Override
    public ProviderRuntimeConfigCatalogResponse catalog() {
        try {
            ProviderRuntimeConfigCatalogResponse response = pythonAiRestClient.get()
                    .uri("/ai/provider/config")
                    .header("X-API-Key", properties.getApiKey())
                    .retrieve()
                    .body(ProviderRuntimeConfigCatalogResponse.class);
            return response == null ? ProviderRuntimeConfigCatalogResponse.empty() : response;
        } catch (RuntimeException exception) {
            log.warn("Failed to load provider runtime configuration from python ai-service", exception);
            return ProviderRuntimeConfigCatalogResponse.empty();
        }
    }

    @Override
    public ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig update(String providerId,
                                                                            ProviderRuntimeConfigRequest request) {
        return pythonAiRestClient.put()
                .uri("/ai/provider/config/{providerId}", providerId)
                .header("X-API-Key", properties.getApiKey())
                .body(request)
                .retrieve()
                .body(ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig.class);
    }
}
