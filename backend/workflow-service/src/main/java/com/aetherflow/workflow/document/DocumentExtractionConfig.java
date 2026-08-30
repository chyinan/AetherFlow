package com.aetherflow.workflow.document;

// pattern: Imperative Shell
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(DocumentExtractionProperties.class)
public class DocumentExtractionConfig {
}
