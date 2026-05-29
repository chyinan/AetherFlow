package com.aetherflow.file.model;

import io.swagger.v3.oas.annotations.media.Schema;

public final class ChunkUploadDtos {

    private ChunkUploadDtos() {
    }

    @Schema(description = "Chunk upload initialization request.")
    public record InitRequest(
            @Schema(description = "Original file name.", example = "demo.mp4")
            String originalName,

            @Schema(description = "File content type.", example = "video/mp4")
            String contentType,

            @Schema(description = "Total file size in bytes.", example = "104857600")
            Long size,

            @Schema(description = "Expected total number of parts.", example = "12")
            Integer totalParts,

            @Schema(description = "Optional final file SHA256 checksum.")
            String checksum
    ) {
    }

    @Schema(description = "Chunk upload initialization response.")
    public record InitResponse(
            @Schema(description = "Upload session id.", example = "3b5b6a67f70343c496d3241d7d3c9a51")
            String uploadId,

            @Schema(description = "Original file name.", example = "demo.mp4")
            String originalName,

            @Schema(description = "File content type.", example = "video/mp4")
            String contentType,

            @Schema(description = "Total file size in bytes.", example = "104857600")
            Long size,

            @Schema(description = "Expected total number of parts.", example = "12")
            Integer totalParts,

            @Schema(description = "Upload session creation time.")
            String createdAt
    ) {
    }

    @Schema(description = "Chunk part upload response.")
    public record PartResponse(
            @Schema(description = "Upload session id.")
            String uploadId,

            @Schema(description = "Received part number.", example = "1")
            int partNumber,

            @Schema(description = "Received part size in bytes.", example = "5242880")
            long size,

            @Schema(description = "Number of received parts.", example = "3")
            int receivedParts,

            @Schema(description = "Expected total number of parts.", example = "12")
            int totalParts,

            @Schema(description = "Whether all expected parts have been received.", example = "false")
            boolean complete
    ) {
    }

    @Schema(description = "Chunk upload completion request.")
    public record CompleteRequest(
            @Schema(description = "Optional final file SHA256 checksum.")
            String checksum
    ) {
    }
}
