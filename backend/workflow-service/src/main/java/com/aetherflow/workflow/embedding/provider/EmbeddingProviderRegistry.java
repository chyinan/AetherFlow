package com.aetherflow.workflow.embedding.provider;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class EmbeddingProviderRegistry {

    private final Map<String, EmbeddingProvider> providers = new LinkedHashMap<>();

    public EmbeddingProviderRegistry(List<EmbeddingProvider> providers) {
        for (EmbeddingProvider provider : providers) {
            this.providers.put(normalize(provider.providerName()), provider);
        }
    }

    public EmbeddingProvider select(EmbeddingNodeConfig config) {
        EmbeddingProvider provider = providers.get(normalize(config.provider()));
        if (provider == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "embedding provider is not registered: " + config.provider());
        }
        return provider;
    }

    private String normalize(String provider) {
        return provider == null ? "" : provider.trim().toLowerCase(Locale.ROOT);
    }
}
