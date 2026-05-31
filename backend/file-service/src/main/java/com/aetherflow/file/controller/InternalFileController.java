package com.aetherflow.file.controller;

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.FileInternalProperties;
import com.aetherflow.file.service.FileDownload;
import com.aetherflow.file.service.FileInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    @Operation(summary = "Create file metadata",
            description = "Register metadata for an object already stored in MinIO. This endpoint is reserved for internal service-to-service calls.")
    @ApiResponse(responseCode = "200", description = "File metadata registered.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    examples = @ExampleObject(value = """
                            {
                              "code": 0,
                              "message": "success",
                              "data": {
                                "id": 1001,
                                "bucket": "aetherflow",
                                "objectKey": "workflow/output/demo.mp4",
                                "originalName": "demo.mp4",
                                "contentType": "video/mp4",
                                "size": 1048576,
                                "url": "http://192.168.101.68:9000/aetherflow/workflow/output/demo.mp4"
                              }
                            }
                            """)))
    @PostMapping("/metadata")
    public Result<FileMetadataDTO> createMetadata(
            @RequestHeader(value = InternalHeaders.FILE_SERVICE_TOKEN, required = false) String internalToken,
            @Valid @RequestBody CreateFileMetadataRequestDTO request) {
        validateInternalToken(internalToken);
        return Result.success(fileInfoService.createMetadata(request.getUserId(), request));
    }

    @Operation(summary = "Get file metadata",
            description = "Read file metadata by id for internal service-to-service workflow nodes.")
    @GetMapping("/metadata/{fileId}")
    public Result<FileMetadataDTO> getMetadata(
            @RequestHeader(value = InternalHeaders.FILE_SERVICE_TOKEN, required = false) String internalToken,
            @PathVariable Long fileId) {
        validateInternalToken(internalToken);
        return Result.success(fileInfoService.getMetadata(fileId));
    }

    @Operation(summary = "Download file internally",
            description = "Streams an available file by metadata id for internal workflow-service nodes. Requires X-Internal-File-Token.")
    @ApiResponse(responseCode = "200", description = "File binary stream for internal service-to-service OCR processing.",
            content = @Content(mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE,
                    schema = @Schema(type = "string", format = "binary"),
                    examples = @ExampleObject(value = "binary file stream")))
    @GetMapping("/{fileId}/download")
    public ResponseEntity<InputStreamResource> download(
            @RequestHeader(value = InternalHeaders.FILE_SERVICE_TOKEN, required = false) String internalToken,
            @PathVariable Long fileId) {
        validateInternalToken(internalToken);
        FileDownload fileDownload = fileInfoService.downloadInternal(fileId);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(fileDownload.originalName(), StandardCharsets.UTF_8)
                .build());
        if (fileDownload.size() != null && fileDownload.size() >= 0) {
            headers.setContentLength(fileDownload.size());
        }

        return ResponseEntity.ok()
                .headers(headers)
                .contentType(resolveMediaType(fileDownload.contentType()))
                .body(new InputStreamResource(fileDownload.stream()));
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

    private MediaType resolveMediaType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType);
        } catch (Exception exception) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}

