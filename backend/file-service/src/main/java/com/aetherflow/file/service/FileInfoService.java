package com.aetherflow.file.service;

// pattern: Imperative Shell

import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.dto.GeneratedArtifactBatchRequestDTO;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.model.FileAssetDtos.FileAssetPageResponse;
import com.aetherflow.file.model.FileAssetDtos.FileAssetMetadataView;
import com.aetherflow.file.model.FileClassificationUpdateRequest;
import com.aetherflow.file.model.FileMetricsResponse;
import com.aetherflow.file.model.FileStatusResponse;
import com.aetherflow.file.model.UploadProgressView;
import org.springframework.web.multipart.MultipartFile;

public interface FileInfoService {

    FileMetadataDTO upload(Long userId, MultipartFile file, String taskId);

    FileDownload download(Long userId, Long fileId);

    FileDownload downloadInternal(Long fileId);

    FileDownload downloadInternal(Long userId, Long fileId);

    void delete(Long userId, Long fileId);

    FileAssetMetadataView updateClassification(Long userId, Long fileId, FileClassificationUpdateRequest request);

    FileMetadataDTO getMetadata(Long fileId);

    FileMetadataDTO getMetadata(Long userId, Long fileId);

    FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request);

    FileMetadataDTO storeGeneratedArtifact(CreateGeneratedFileRequestDTO request);

    java.util.List<FileMetadataDTO> commitGeneratedArtifactBatch(GeneratedArtifactBatchRequestDTO request);

    void abortGeneratedArtifactBatch(GeneratedArtifactBatchRequestDTO request);

    int reconcileStaleGeneratedArtifacts();

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
