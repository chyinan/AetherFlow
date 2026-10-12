package com.aetherflow.common.dto;

// pattern: Functional Core

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

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

    @Schema(description = "带时间范围的转写片段，供下游结构化映射使用。")
    private List<AiTranscriptionSegmentDTO> segments = List.of();

    // 保留原来的四参数构造器，已有调用不需要迁移。
    public AiTranscriptionResponseDTO(String text, String srtContent, String srtFileName, Double durationSeconds) {
        this.text = text;
        this.srtContent = srtContent;
        this.srtFileName = srtFileName;
        this.durationSeconds = durationSeconds;
    }
}

