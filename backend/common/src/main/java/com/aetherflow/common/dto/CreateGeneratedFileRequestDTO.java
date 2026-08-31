package com.aetherflow.common.dto;

// pattern: Functional Core

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "Internal request to persist a generated artifact and its tenant-owned metadata.")
public class CreateGeneratedFileRequestDTO {

    @NotNull
    @Positive
    @Schema(description = "Owner user id.", example = "10001")
    private Long userId;

    @NotNull
    @Positive
    @Schema(description = "Owning AI job id.", example = "3003")
    private Long aiJobId;

    @NotNull
    @Positive
    @Schema(description = "Owning asynchronous task id.", example = "77")
    private Long taskId;

    @NotBlank
    @Size(max = 64)
    @Schema(description = "Current fenced AI job lease token.")
    private String leaseToken;

    @NotBlank
    @Size(max = 128)
    @Schema(description = "Atomic artifact batch id.", example = "ai-task:77:node-whisper:artifacts")
    private String artifactBatchId;

    @NotNull
    @jakarta.validation.constraints.PositiveOrZero
    @Schema(description = "Original artifact ordinal in the node result.", example = "0")
    private Integer artifactOrdinal;

    @NotBlank
    @Size(max = 128)
    @Schema(description = "Durable operation idempotency key.", example = "ai-task:77:node-whisper:SRT")
    private String idempotencyKey;

    @NotBlank
    @Size(max = 128)
    @Schema(description = "Workflow instance id.", example = "2002")
    private String workflowId;

    @NotBlank
    @Size(max = 32)
    @Schema(description = "Artifact source.", example = "AI")
    private String source;

    @NotBlank
    @Size(max = 64)
    @Schema(description = "Artifact kind.", example = "SRT")
    private String artifactKind;

    @NotBlank
    @Size(max = 255)
    @Schema(description = "Generated file name.", example = "transcription.srt")
    private String originalName;

    @NotBlank
    @Size(max = 128)
    @Schema(description = "MIME content type.", example = "text/plain")
    private String contentType;

    @NotBlank
    @Schema(description = "Base64 encoded artifact bytes.")
    private String contentBase64;
}
