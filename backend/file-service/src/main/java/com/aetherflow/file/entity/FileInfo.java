package com.aetherflow.file.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_file_info")
@Schema(description = "File metadata persisted by file-service.")
public class FileInfo extends BaseEntity {

    @Schema(description = "Owner user id.", example = "1001")
    private Long userId;

    @TableField("uploader_id")
    @Schema(description = "Uploader user id.", example = "1001")
    private Long uploaderId;

    @Schema(description = "MinIO bucket name.", example = "aetherflow")
    private String bucket;

    @Schema(description = "MinIO object key.", example = "uploads/2026/05/27/uuid.mp4")
    private String objectKey;

    @Schema(description = "Original upload file name.", example = "demo.mp4")
    private String originalName;

    @Schema(description = "File content type.", example = "video/mp4")
    private String contentType;

    @TableField("mime_type")
    @Schema(description = "Detected MIME type.", example = "video/mp4")
    private String mimeType;

    @TableField("file_hash")
    @Schema(description = "SHA256 file hash.", example = "d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2")
    private String hash;

    @TableField("file_size")
    @Schema(description = "File size in bytes.", example = "1048576")
    private Long fileSize;

    @TableField("file_url")
    @Schema(description = "Public MinIO URL.")
    private String fileUrl;

    @Schema(description = "File status.", example = "AVAILABLE")
    private String status;

    @TableField("upload_duration")
    @Schema(description = "Upload duration in milliseconds.", example = "312")
    private Long uploadDuration;
}
