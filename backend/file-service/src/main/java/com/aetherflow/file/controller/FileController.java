package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.model.ChunkUploadDtos;
import com.aetherflow.file.model.FileAssetDtos.FileAssetPageResponse;
import com.aetherflow.file.model.UploadProgressView;
import com.aetherflow.file.service.ChunkUploadService;
import com.aetherflow.file.service.FileDownload;
import com.aetherflow.file.service.FileInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
@Tag(name = "File Management", description = "Enterprise file upload, dedupe, progress, download and delete APIs.")
public class FileController {

    private final FileInfoService fileInfoService;
    private final ChunkUploadService chunkUploadService;

    @Operation(summary = "List files",
            description = "List current user's available file assets with query, type and frontend metadata filters.")
    @ApiResponse(responseCode = "200", description = "File assets returned.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = FileAssetPageResponse.class)))
    @GetMapping
    public Result<FileAssetPageResponse> listFiles(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Search text for original name, object key or MIME.", example = "demo")
            @RequestParam(required = false) String query,
            @Parameter(description = "Frontend file type filter.", example = "audio")
            @RequestParam(required = false) String type,
            @Parameter(description = "File source filter. Current model supports input.", example = "input")
            @RequestParam(required = false) String source,
            @Parameter(description = "Artifact kind filter. Current model supports input.", example = "input")
            @RequestParam(required = false) String artifactKind,
            @Parameter(description = "Workflow id filter. Returns an empty page until workflow linkage is persisted.", example = "wf-1")
            @RequestParam(required = false) String workflowId,
            @Parameter(description = "Page number, starting from 1.", example = "1")
            @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "Page size.", example = "20")
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(fileInfoService.listAssets(userId, query, type, source, artifactKind, workflowId,
                page, pageSize));
    }

    @Operation(
            summary = "Upload file with governance",
            description = "Upload a MultipartFile with size/type/rate protection, SHA256 dedupe, Redis progress cache and metadata persistence."
    )
    @ApiResponse(responseCode = "200", description = "File uploaded or dedupe hit.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    examples = @ExampleObject(value = """
                            {
                              "code": 0,
                              "message": "success",
                              "data": {
                                "id": 1001,
                                "bucket": "aetherflow",
                                "objectKey": "objects/sha256/ab/cd/abcdef.mp4",
                                "originalName": "demo.mp4",
                                "contentType": "video/mp4",
                                "size": 1048576,
                                "url": "http://192.168.101.68:9000/aetherflow/objects/sha256/ab/cd/abcdef.mp4"
                              },
                              "traceId": "0f9f8c6b7a1e4f48",
                              "path": "/files/upload"
                            }
                            """)))
    @PostMapping(value = {"", "/upload"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Result<FileMetadataDTO>> upload(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Client provided upload task id. If absent, file-service generates one.", example = "task-20260528-0001")
            @RequestHeader(value = "X-Upload-Task-Id", required = false) String taskId,
            @Parameter(description = "Uploaded file. Allowed by configured extension and MIME whitelist.", required = true)
            @RequestPart("file") MultipartFile file) {
        String uploadTaskId = StringUtils.hasText(taskId) ? taskId : UUID.randomUUID().toString();
        FileMetadataDTO metadata = fileInfoService.upload(userId, file, uploadTaskId);
        return ResponseEntity.ok()
                .header("X-Upload-Task-Id", uploadTaskId)
                .header("X-File-Id", String.valueOf(metadata.getId()))
                .body(Result.success(metadata));
    }

    @Operation(summary = "Initialize chunk upload", description = "Create a chunk upload session for a large file.")
    @ApiResponse(responseCode = "200", description = "Chunk upload session created.")
    @PostMapping("/uploads")
    public Result<ChunkUploadDtos.InitResponse> initChunkUpload(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @RequestBody ChunkUploadDtos.InitRequest request) {
        return Result.success(chunkUploadService.init(userId, request));
    }

    @Operation(summary = "Upload chunk part", description = "Upload one numbered part of a chunk upload session.")
    @ApiResponse(responseCode = "200", description = "Chunk part accepted.")
    @PutMapping(value = "/uploads/{uploadId}/parts/{partNumber}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<ChunkUploadDtos.PartResponse> uploadChunkPart(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Chunk upload session id.", required = true)
            @PathVariable String uploadId,
            @Parameter(description = "1-based chunk part number.", required = true, example = "1")
            @PathVariable int partNumber,
            @Parameter(description = "Chunk part binary.", required = true)
            @RequestPart("file") MultipartFile file) {
        return Result.success(chunkUploadService.uploadPart(userId, uploadId, partNumber, file));
    }

    @Operation(summary = "Complete chunk upload", description = "Assemble all received parts and persist the file using the existing governed upload path.")
    @ApiResponse(responseCode = "200", description = "Chunk upload completed.")
    @PostMapping("/uploads/{uploadId}/complete")
    public Result<FileMetadataDTO> completeChunkUpload(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Chunk upload session id.", required = true)
            @PathVariable String uploadId,
            @RequestBody(required = false) ChunkUploadDtos.CompleteRequest request) {
        ChunkUploadDtos.CompleteRequest safeRequest = request == null ? new ChunkUploadDtos.CompleteRequest(null) : request;
        return Result.success(chunkUploadService.complete(userId, uploadId, safeRequest));
    }

    @Operation(summary = "Abort chunk upload", description = "Abort a chunk upload session and remove temporary parts.")
    @ApiResponse(responseCode = "200", description = "Chunk upload aborted.")
    @DeleteMapping("/uploads/{uploadId}")
    public Result<Void> abortChunkUpload(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Chunk upload session id.", required = true)
            @PathVariable String uploadId) {
        chunkUploadService.abort(userId, uploadId);
        return Result.success();
    }

    @Operation(summary = "Download file", description = "Download an available file by metadata id. The caller must own the file metadata.")
    @ApiResponse(responseCode = "200", description = "File binary stream.",
            content = @Content(mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE,
                    schema = @Schema(type = "string", format = "binary")))
    @GetMapping("/{id}/download")
    public ResponseEntity<InputStreamResource> download(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "File metadata id.", required = true, example = "1001")
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

    @Operation(summary = "Delete file", description = "Mark file metadata as DELETED and remove the MinIO object only when no dedupe reference still uses it.")
    @ApiResponse(responseCode = "200", description = "File deleted.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    examples = @ExampleObject(value = """
                            {
                              "code": 0,
                              "message": "success",
                              "traceId": "0f9f8c6b7a1e4f48",
                              "path": "/files/1001"
                            }
                            """)))
    @DeleteMapping("/{id}")
    public Result<Void> delete(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "File metadata id.", required = true, example = "1001")
            @PathVariable("id") Long id) {
        fileInfoService.delete(userId, id);
        return Result.success();
    }

    @Operation(summary = "Get upload progress", description = "Query Redis cached upload progress by task id.")
    @ApiResponse(responseCode = "200", description = "Upload progress snapshot.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    examples = @ExampleObject(value = """
                            {
                              "code": 0,
                              "message": "success",
                              "data": {
                                "taskId": "task-20260528-0001",
                                "fileId": 1001,
                                "status": "COMPLETED",
                                "percentage": 100,
                                "message": "Upload completed",
                                "hash": "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
                                "userId": 1001
                              }
                            }
                            """)))
    @GetMapping("/progress/{taskId}")
    public Result<UploadProgressView> getUploadProgress(
            @Parameter(description = "Gateway forwarded user id.", required = true, example = "1001")
            @RequestHeader(value = "X-User-Id", required = false) Long userId,
            @Parameter(description = "Upload task id returned in X-Upload-Task-Id.", required = true, example = "task-20260528-0001")
            @PathVariable("taskId") String taskId) {
        return Result.success(fileInfoService.getUploadProgress(userId, taskId));
    }

    private MediaType resolveMediaType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType);
        } catch (Exception exception) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}

