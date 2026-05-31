package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "Internal request to register generated file metadata.")
public class CreateFileMetadataRequestDTO {

    @NotBlank
    @Schema(description = "Object storage bucket.", example = "aetherflow")
    private String bucket;

    @NotBlank
    @Schema(description = "Object storage key.", example = "workflow/exports/workflow-summary.md")
    private String objectKey;

    @Schema(description = "Original or generated file name.", example = "workflow-summary.md")
    private String originalName;

    @Schema(description = "MIME content type.", example = "text/markdown")
    private String contentType;

    @Schema(description = "File size in bytes.", example = "4096")
    private Long size;

    @Schema(description = "Owner user id for generated artifacts.", example = "10001")
    private Long userId;
}

