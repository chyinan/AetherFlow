package com.aetherflow.file.service;

import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.model.FileAssetDtos.FileAssetPageResponse;
import com.aetherflow.file.model.FileMetricsResponse;
import com.aetherflow.file.model.FileStatusResponse;
import com.aetherflow.file.model.UploadProgressView;
import org.springframework.web.multipart.MultipartFile;

public interface FileInfoService {

    FileMetadataDTO upload(Long userId, MultipartFile file, String taskId);

    FileDownload download(Long userId, Long fileId);

    FileDownload downloadInternal(Long fileId);

    void delete(Long userId, Long fileId);

    FileMetadataDTO getMetadata(Long fileId);

    FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request);

    FileAssetPageResponse listAssets(Long userId,
                                     String query,
                                     String type,
                                     String source,
                                     String artifactKind,
                                     String workflowId,
                                     int page,
                                     int pageSize);

    UploadProgressView getUploadProgress(Long userId, String taskId);

    FileStatusResponse getStatus();

    FileMetricsResponse getMetrics();
}
