package com.aetherflow.file.service;

import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.model.FileMetricsResponse;
import com.aetherflow.file.model.FileStatusResponse;
import com.aetherflow.file.model.UploadProgressView;
import org.springframework.web.multipart.MultipartFile;

public interface FileInfoService {

    FileMetadataDTO upload(Long userId, MultipartFile file, String taskId);

    FileDownload download(Long userId, Long fileId);

    void delete(Long userId, Long fileId);

    FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request);

    UploadProgressView getUploadProgress(String taskId);

    FileStatusResponse getStatus();

    FileMetricsResponse getMetrics();
}
