package com.aetherflow.file.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_file_object")
public class FileObject {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;
    private String bucket;
    private String objectKey;
    private String originalName;
    private String contentType;
    private Long size;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

