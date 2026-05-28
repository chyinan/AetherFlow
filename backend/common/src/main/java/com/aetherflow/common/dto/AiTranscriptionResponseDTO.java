package com.aetherflow.common.dto;

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

    @Schema(description = "Object storage key of generated SRT subtitle file.", example = "subtitles/audio.srt")
    private String srtObjectKey;

    @Schema(description = "Media duration in seconds.", example = "62.5")
    private Double durationSeconds;
}

