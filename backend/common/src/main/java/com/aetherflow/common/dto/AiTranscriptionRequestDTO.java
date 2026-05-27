package com.aetherflow.common.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AiTranscriptionRequestDTO {

    @NotBlank
    private String fileUrl;

    private String language;
    private String prompt;
}

