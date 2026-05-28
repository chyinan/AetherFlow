package com.aetherflow.file.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Upload progress snapshot.")
public record UploadProgressView(
        @Schema(description = "Upload task id.", example = "task-20260528-0001")
        String taskId,
        @Schema(description = "Current file metadata id.", example = "1001")
        Long fileId,
        @Schema(description = "Upload status.", example = "UPLOADING")
        String status,
        @Schema(description = "Progress percentage.", example = "65")
        Integer percentage,
        @Schema(description = "Status message.", example = "MinIO upload in progress")
        String message,
        @Schema(description = "SHA256 hash.", example = "0f2d9a7f3f5f4d0a4f4b0c0c0d0e0f101112131415161718191a1b1c1d1e1f20")
        String hash,
        @Schema(description = "Owner user id.", example = "1001")
        Long userId
) {
}
