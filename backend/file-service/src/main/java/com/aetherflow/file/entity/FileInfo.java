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

    @Schema(description = "MinIO bucket name.", example = "aetherflow")
    private String bucket;

    @Schema(description = "MinIO object key.", example = "uploads/2026/05/27/uuid.mp4")
    private String objectKey;

    @Schema(description = "Original upload file name.", example = "demo.mp4")
    private String originalName;

    @Schema(description = "File content type.", example = "video/mp4")
    private String contentType;

    @TableField("file_size")
    @Schema(description = "File size in bytes.", example = "1048576")
    private Long fileSize;

    @TableField("file_url")
    @Schema(description = "Public MinIO URL.")
    private String fileUrl;

    @Schema(description = "File status.", example = "AVAILABLE")
    private String status;
}
