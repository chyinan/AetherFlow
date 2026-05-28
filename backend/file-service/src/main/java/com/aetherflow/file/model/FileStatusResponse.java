package com.aetherflow.file.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "File governance status snapshot.")
public record FileStatusResponse(
        @Schema(description = "MinIO connectivity status.", example = "UP")
        String minioStatus,
        @Schema(description = "Current available file count.", example = "128")
        Long fileCount,
        @Schema(description = "Current uploading task count.", example = "3")
        Long uploadingTaskCount,
        @Schema(description = "Current physical storage size in bytes.", example = "104857600")
        Long storageSizeBytes
) {
}
