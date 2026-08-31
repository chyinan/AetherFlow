package com.aetherflow.common.dto;

// pattern: Functional Core

import lombok.Data;

@Data
public class AiMediaTransformRequestDTO {
    private String fileUrl;
    private String operation = "extract-audio";
    private String outputFormat = "wav";
    private Double timeoutSeconds = 120.0;
}
