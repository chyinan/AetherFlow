package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.service.FileDownload;
import com.aetherflow.file.service.FileInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
@Tag(name = "File Management", description = "File upload, download, delete and metadata APIs.")
public class FileController {

    private final FileInfoService fileInfoService;

    @Operation(summary = "Upload file", description = "Upload a MultipartFile to MinIO and persist file metadata.")
    @ApiResponse(responseCode = "200", description = "File uploaded.")
    @PostMapping(value = {"", "/upload"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<FileMetadataDTO> upload(
            @Parameter(description = "Gateway forwarded user id.", required = true)
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Uploaded file.", required = true)
            @RequestPart("file") MultipartFile file) {
        return Result.success(fileInfoService.upload(userId, file));
    }

    @Operation(summary = "Download file", description = "Download a file by metadata id.")
    @ApiResponse(responseCode = "200", description = "File binary stream.",
            content = @Content(mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE,
                    schema = @Schema(type = "string", format = "binary")))
    @GetMapping("/{id}/download")
    public ResponseEntity<InputStreamResource> download(
            @Parameter(description = "Gateway forwarded user id.", required = true)
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "File metadata id.", required = true)
            @PathVariable("id") Long id) {
        FileDownload fileDownload = fileInfoService.download(userId, id);

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

    @Operation(summary = "Delete file", description = "Delete a MinIO object and mark metadata status as DELETED.")
    @ApiResponse(responseCode = "200", description = "File deleted.")
    @DeleteMapping("/{id}")
    public Result<Void> delete(
            @Parameter(description = "Gateway forwarded user id.", required = true)
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "File metadata id.", required = true)
            @PathVariable("id") Long id) {
        fileInfoService.delete(userId, id);
        return Result.success();
    }

    private MediaType resolveMediaType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType);
        } catch (Exception exception) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}

