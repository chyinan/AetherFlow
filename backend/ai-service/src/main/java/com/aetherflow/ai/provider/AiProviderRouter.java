package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class AiProviderRouter {

    private final Map<AiProviderType, AiProvider> providers;
    private final AiProviderType defaultProvider;

    @Autowired
    public AiProviderRouter(List<AiProvider> providers, AiTaskProperties properties) {
        this(providers, properties.getDefaultProvider());
    }

    public AiProviderRouter(List<AiProvider> providers, AiProviderType defaultProvider) {
        this.providers = new EnumMap<>(AiProviderType.class);
        for (AiProvider provider : providers) {
            this.providers.put(provider.type(), provider);
        }
        this.defaultProvider = defaultProvider;
    }

    public AiProviderResponse complete(AiProviderRequest request) {
        AiProviderType providerType = request.provider() == null ? defaultProvider : request.provider();
        AiProvider provider = providers.get(providerType);
        if (provider == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "ai provider unavailable: " + providerType);
        }
        return provider.complete(request);
    }
}
