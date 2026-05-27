package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.service.FileInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/files")
@RequiredArgsConstructor
@Tag(name = "Internal File Metadata", description = "Internal file metadata APIs for service-to-service calls.")
public class InternalFileController {

    private final FileInfoService fileInfoService;

    @Operation(summary = "Create file metadata", description = "Register metadata for an object already stored in MinIO.")
    @PostMapping("/metadata")
    public Result<FileMetadataDTO> createMetadata(@Valid @RequestBody CreateFileMetadataRequestDTO request) {
        return Result.success(fileInfoService.createMetadata(null, request));
    }
}

