package com.aetherflow.workflow.ocr;

import com.aetherflow.workflow.ocr.config.OCRProperties;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class OCRNodeConfigTest {

    @Test
    void readsOcrConfigWithDefaults() {
        OCRProperties properties = new OCRProperties();
        properties.setDefaultLanguage("eng");
        properties.setDefaultProvider("tesseract");

        OCRNodeConfig config = OCRNodeConfig.from(Map.of(), properties);

        assertThat(config.language()).isEqualTo("eng");
        assertThat(config.provider()).isEqualTo("tesseract");
        assertThat(config.enableTable()).isFalse();
        assertThat(config.enableLayout()).isFalse();
        assertThat(config.mock()).isFalse();
    }

    @Test
    void readsOcrConfigFromNodeMap() {
        OCRProperties properties = new OCRProperties();
        properties.setDefaultLanguage("eng");
        properties.setDefaultProvider("tesseract");

        OCRNodeConfig config = OCRNodeConfig.from(Map.of(
                "language", "chi_sim",
                "provider", "cloud",
                "enableTable", true,
                "enableLayout", true,
                "mock", true
        ), properties);

        assertThat(config.language()).isEqualTo("chi_sim");
        assertThat(config.provider()).isEqualTo("cloud");
        assertThat(config.enableTable()).isTrue();
        assertThat(config.enableLayout()).isTrue();
        assertThat(config.mock()).isTrue();
    }
}
