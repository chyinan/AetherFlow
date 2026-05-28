package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.service.FileInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
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
    public Result<FileMetadataDTO> createMetadata(@Valid @RequestBody CreateFileMetadataRequestDTO request) {
        return Result.success(fileInfoService.createMetadata(null, request));
    }
}

