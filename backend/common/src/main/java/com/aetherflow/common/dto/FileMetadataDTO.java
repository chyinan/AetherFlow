package com.aetherflow.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FileMetadataDTO {

    private Long id;
    private String bucket;
    private String objectKey;
    private String originalName;
    private String contentType;
    private Long size;
    private String url;
}

