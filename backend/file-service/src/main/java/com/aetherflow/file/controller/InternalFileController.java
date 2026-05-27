package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.service.FileStorageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/files")
@RequiredArgsConstructor
public class InternalFileController {

    private final FileStorageService fileStorageService;

    @PostMapping("/metadata")
    public Result<FileMetadataDTO> createMetadata(@Valid @RequestBody CreateFileMetadataRequestDTO request) {
        return Result.success(fileStorageService.createMetadata(null, request));
    }
}

