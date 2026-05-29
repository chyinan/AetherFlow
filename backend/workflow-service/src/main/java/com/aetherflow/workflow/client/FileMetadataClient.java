package com.aetherflow.workflow.client;

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "file-service", path = "/internal/files")
public interface FileMetadataClient {

    @GetMapping("/metadata/{fileId}")
    Result<FileMetadataDTO> getMetadata(
            @RequestHeader(InternalHeaders.FILE_SERVICE_TOKEN) String internalToken,
            @PathVariable Long fileId);

    @PostMapping("/metadata")
    Result<FileMetadataDTO> createMetadata(
            @RequestHeader(InternalHeaders.FILE_SERVICE_TOKEN) String internalToken,
            @RequestBody CreateFileMetadataRequestDTO request);

    @GetMapping("/{fileId}/download")
    ResponseEntity<byte[]> downloadFile(
            @RequestHeader(InternalHeaders.FILE_SERVICE_TOKEN) String internalToken,
            @PathVariable Long fileId);
}
