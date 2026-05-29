package com.aetherflow.workflow.ocr.provider;

import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import org.springframework.stereotype.Component;

@Component
public class MockOCRProvider implements OCRProvider {

    private final OCRProperties properties;

    public MockOCRProvider(OCRProperties properties) {
        this.properties = properties;
    }

    @Override
    public String providerName() {
        return "mock";
    }

    @Override
    public OCRResult recognize(OCRRequest request) {
        return new OCRResult(
                properties.getMockText(),
                "mock",
                1.0,
                1
        );
    }
}
