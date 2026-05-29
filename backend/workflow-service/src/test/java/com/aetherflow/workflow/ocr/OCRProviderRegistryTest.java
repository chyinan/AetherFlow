package com.aetherflow.workflow.ocr;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import com.aetherflow.workflow.ocr.provider.OCRProvider;
import com.aetherflow.workflow.ocr.provider.OCRProviderRegistry;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OCRProviderRegistryTest {

    @Test
    void selectsMockProviderWhenMockModeIsEnabled() {
        OCRProvider tesseract = provider("tesseract");
        OCRProvider mock = provider("mock");
        OCRProperties properties = new OCRProperties();
        properties.setDefaultProvider("tesseract");
        OCRProviderRegistry registry = new OCRProviderRegistry(List.of(tesseract, mock), properties);

        OCRProvider selected = registry.select(OCRNodeConfig.from(Map.of("mock", true), properties));

        assertThat(selected).isSameAs(mock);
    }

    @Test
    void failsWhenProviderIsNotRegistered() {
        OCRProvider tesseract = provider("tesseract");
        OCRProperties properties = new OCRProperties();
        properties.setDefaultProvider("tesseract");
        OCRProviderRegistry registry = new OCRProviderRegistry(List.of(tesseract), properties);

        assertThatThrownBy(() -> registry.select(OCRNodeConfig.from(Map.of("provider", "cloud"), properties)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST));
    }

    private static OCRProvider provider(String name) {
        OCRProvider provider = mock(OCRProvider.class);
        when(provider.providerName()).thenReturn(name);
        return provider;
    }
}
