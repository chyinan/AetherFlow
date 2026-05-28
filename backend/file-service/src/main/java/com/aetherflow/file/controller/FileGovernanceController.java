package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.file.model.FileMetricsResponse;
import com.aetherflow.file.model.FileStatusResponse;
import com.aetherflow.file.service.FileInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/file")
@RequiredArgsConstructor
@Tag(name = "File Governance", description = "File service status, metrics and storage governance APIs.")
public class FileGovernanceController {

    private final FileInfoService fileInfoService;

    @Operation(summary = "Get file service status",
            description = "Return current file count, MinIO status, uploading task count and physical storage size.")
    @ApiResponse(responseCode = "200", description = "File service status.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    examples = @ExampleObject(value = """
                            {
                              "code": 0,
                              "message": "success",
                              "data": {
                                "minioStatus": "UP",
                                "fileCount": 128,
                                "uploadingTaskCount": 3,
                                "storageSizeBytes": 104857600
                              }
                            }
                            """)))
    @GetMapping("/status")
    public Result<FileStatusResponse> status() {
        return Result.success(fileInfoService.getStatus());
    }

    @Operation(summary = "Get file metrics",
            description = "Return file governance metrics including current file count, MinIO status, uploading task count, physical storage size and average upload duration.")
    @ApiResponse(responseCode = "200", description = "File metrics.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    examples = @ExampleObject(value = """
                            {
                              "code": 0,
                              "message": "success",
                              "data": {
                                "minioStatus": "UP",
                                "fileCount": 128,
                                "uploadingTaskCount": 3,
                                "storageSizeBytes": 104857600,
                                "averageUploadDurationMs": 312
                              }
                            }
                            """)))
    @GetMapping("/metrics")
    public Result<FileMetricsResponse> metrics() {
        return Result.success(fileInfoService.getMetrics());
    }
}
