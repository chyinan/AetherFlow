package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "File metadata shared across file, workflow and AI services.")
public class FileMetadataDTO {

    @Schema(description = "File metadata id.", example = "1001")
    private Long id;

    @Schema(description = "Object storage bucket.", example = "aetherflow")
    private String bucket;

    @Schema(description = "Object storage key.", example = "uploads/audio.mp3")
    private String objectKey;

    @Schema(description = "Original uploaded file name.", example = "meeting.mp3")
    private String originalName;

    @Schema(description = "MIME content type.", example = "audio/mpeg")
    private String contentType;

    @Schema(description = "File size in bytes.", example = "1048576")
    private Long size;

    @Schema(description = "Public or service-accessible file URL.", example = "http://minio/aetherflow/uploads/audio.mp3")
    private String url;
}

