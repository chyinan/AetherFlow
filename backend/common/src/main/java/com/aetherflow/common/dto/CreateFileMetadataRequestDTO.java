package com.aetherflow.common.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateFileMetadataRequestDTO {

    @NotBlank
    private String bucket;

    @NotBlank
    private String objectKey;

    private String originalName;
    private String contentType;
    private Long size;
}

