package com.aetherflow.workflow.document;

// pattern: Imperative Shell
import lombok.Data;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Data
@Validated
@ConfigurationProperties(prefix = "aetherflow.workflow.document")
public class DocumentExtractionProperties {

    @Min(1)
    private long maxFileBytes = 25L * 1024L * 1024L;
    @Min(1)
    private int maxExtractedCharacters = 1_000_000;
}
