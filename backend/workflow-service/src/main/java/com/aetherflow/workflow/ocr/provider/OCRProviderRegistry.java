package com.aetherflow.workflow.ocr.provider;

// pattern: Functional Core

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
    private static final String AUTO_PROVIDER = "auto";

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
        if (MOCK_PROVIDER.equals(normalize(providerName)) && !properties.isMock()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "mock OCR provider is disabled");
        }
        String normalizedProvider = normalize(providerName);
        OCRProvider provider = AUTO_PROVIDER.equals(normalizedProvider)
                ? providers.values().stream()
                .filter(candidate -> !MOCK_PROVIDER.equals(normalize(candidate.providerName())))
                .findFirst()
                .orElse(null)
                : providers.get(normalizedProvider);
        if (provider == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ocr provider is not registered");
        }
        return provider;
    }

    public void validateReady(Map<String, Object> rawConfig) {
        OCRNodeConfig config = OCRNodeConfig.from(rawConfig, properties);
        OCRProvider provider = select(config);
        if (!config.mock() && !provider.isReady(config.language())) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "ocr provider is not ready for language " + config.language());
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
