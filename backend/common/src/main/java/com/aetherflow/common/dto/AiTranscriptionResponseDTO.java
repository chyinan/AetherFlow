package com.aetherflow.common.dto;

// pattern: Functional Core

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "AI transcription response.")
public class AiTranscriptionResponseDTO {

    @Schema(description = "Transcribed plain text.", example = "hello world")
    private String text;

    @Schema(description = "Generated SRT content that must be persisted by file-service.")
    private String srtContent;

    @Schema(description = "Suggested generated SRT file name.", example = "transcription.srt")
    private String srtFileName;

    @Schema(description = "Media duration in seconds.", example = "62.5")
    private Double durationSeconds;
}

