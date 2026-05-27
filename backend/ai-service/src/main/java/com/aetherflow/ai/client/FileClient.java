package com.aetherflow.ai.client;

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "file-service", path = "/internal/files")
public interface FileClient {

    @PostMapping("/metadata")
    Result<FileMetadataDTO> createMetadata(
            @RequestHeader(InternalHeaders.FILE_SERVICE_TOKEN) String internalToken,
            @RequestBody CreateFileMetadataRequestDTO request);
}

