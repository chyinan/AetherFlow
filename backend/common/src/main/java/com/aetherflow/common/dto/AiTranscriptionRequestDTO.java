package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "Public AI transcription request.")
public class AiTranscriptionRequestDTO {

    @NotBlank
    @Schema(description = "Public or service-accessible file URL to transcribe.",
            example = "http://minio/aetherflow/uploads/audio.mp3")
    private String fileUrl;

    @Schema(description = "Language hint. Use auto when unknown.", example = "auto")
    private String language;

    @Schema(description = "Optional transcription prompt.", example = "Return punctuation and speaker-friendly text.")
    private String prompt;
}

