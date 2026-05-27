package com.aetherflow.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AiTranscriptionResponseDTO {

    private String text;
    private String srtObjectKey;
    private Double durationSeconds;
}

