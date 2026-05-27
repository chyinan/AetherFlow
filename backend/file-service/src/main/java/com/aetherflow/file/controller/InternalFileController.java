package com.aetherflow.file.controller;

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.FileInternalProperties;
import com.aetherflow.file.service.FileInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/internal/files")
@RequiredArgsConstructor
@Tag(name = "Internal File Metadata", description = "Internal file metadata APIs for service-to-service calls.")
public class InternalFileController {

    private final FileInfoService fileInfoService;
    private final FileInternalProperties fileInternalProperties;

    @Operation(summary = "Create file metadata", description = "Register metadata for an object already stored in MinIO.")
    @PostMapping("/metadata")
    public Result<FileMetadataDTO> createMetadata(
            @RequestHeader(value = InternalHeaders.FILE_SERVICE_TOKEN, required = false) String internalToken,
            @Valid @RequestBody CreateFileMetadataRequestDTO request) {
        validateInternalToken(internalToken);
        return Result.success(fileInfoService.createMetadata(null, request));
    }

    private void validateInternalToken(String internalToken) {
        String expectedToken = fileInternalProperties.getInternalToken();
        if (!StringUtils.hasText(internalToken) || !StringUtils.hasText(expectedToken)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "invalid internal file token");
        }
        byte[] actual = internalToken.getBytes(StandardCharsets.UTF_8);
        byte[] expected = expectedToken.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(actual, expected)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "invalid internal file token");
        }
    }
}

