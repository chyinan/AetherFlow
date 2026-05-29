package com.aetherflow.workflow.ocr.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@Data
@ConfigurationProperties(prefix = "aetherflow.workflow.ocr")
public class OCRProperties {

    private String defaultProvider = "tesseract";
    private String defaultLanguage = "auto";
    private boolean mock = false;
    private String mockText = "Mock OCR text for AetherFlow demo.";
    private Duration timeout = Duration.ofSeconds(30);
    private int threadPoolSize = 2;
    private int queueCapacity = 20;
    private final Tesseract tesseract = new Tesseract();

    @Data
    public static class Tesseract {

        private String dataPath = "";
        private String fallbackLanguage = "eng";
    }
}
