package com.aetherflow.common.dto;

// pattern: Functional Core

import lombok.Data;

@Data
public class AiMediaTransformResponseDTO {
    private String fileName;
    private String contentType;
    private String contentBase64;
    private Long size;
    private Double durationSeconds;
}
