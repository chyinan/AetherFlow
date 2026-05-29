package com.aetherflow.file.model;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;
import java.util.List;

public final class FileAssetDtos {

    private FileAssetDtos() {
    }

    @Schema(description = "Paged FileAsset metadata response.")
    public record FileAssetPageResponse(
            @Schema(description = "Current page number.", example = "1")
            int page,
            @Schema(description = "Page size.", example = "20")
            int pageSize,
            @Schema(description = "Total matched files.", example = "42")
            long total,
            @Schema(description = "File assets.")
            List<FileAssetMetadataView> items
    ) {
        public FileAssetPageResponse {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    @Schema(description = "Frontend-shaped file asset metadata.")
    public record FileAssetMetadataView(
            @Schema(description = "File metadata id.", example = "1001")
            Long id,
            @Schema(description = "Backend file id as a string for frontend stable id mapping.", example = "1001")
            String backendFileId,
            @Schema(description = "Display file name.", example = "demo.mp3")
            String name,
            @Schema(description = "Original upload file name.", example = "demo.mp3")
            String originalName,
            @Schema(description = "Frontend file type.", example = "audio")
            String type,
            @Schema(description = "File source.", example = "input")
            String source,
            @Schema(description = "Artifact kind.", example = "input")
            String artifactKind,
            @Schema(description = "File size in bytes.", example = "1048576")
            Long size,
            @Schema(description = "MIME type.", example = "audio/mpeg")
            String mime,
            @Schema(description = "Frontend file status.", example = "ready")
            String status,
            @Schema(description = "Linked workflow id when persisted. Null when not available in current data model.")
            String workflowId,
            @Schema(description = "Human-readable result summary.")
            String result,
            @Schema(description = "Download or public object URL.")
            String downloadUrl,
            @Schema(description = "Object storage key.")
            String objectKey,
            @Schema(description = "Metadata create timestamp.")
            LocalDateTime createdAt,
            @Schema(description = "Metadata update timestamp.")
            LocalDateTime updatedAt
    ) {
    }
}
