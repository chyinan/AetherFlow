package com.aetherflow.workflow.ocr.provider;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ocr.OCRNodeConfig;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class OCRProviderRegistry {

    private static final String MOCK_PROVIDER = "mock";

    private final Map<String, OCRProvider> providers;
    private final OCRProperties properties;

    public OCRProviderRegistry(List<OCRProvider> providers, OCRProperties properties) {
        this.providers = new LinkedHashMap<>();
        providers.forEach(provider -> this.providers.put(normalize(provider.providerName()), provider));
        this.properties = properties;
    }

    public OCRProvider select(OCRNodeConfig config) {
        String providerName = config.mock() ? MOCK_PROVIDER : config.provider();
        if (providerName == null || providerName.isBlank()) {
            providerName = properties.getDefaultProvider();
        }
        OCRProvider provider = providers.get(normalize(providerName));
        if (provider == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ocr provider is not registered");
        }
        return provider;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
