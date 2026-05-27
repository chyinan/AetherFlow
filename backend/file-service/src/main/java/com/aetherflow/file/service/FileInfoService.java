package com.aetherflow.file.service;

import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import org.springframework.web.multipart.MultipartFile;

public interface FileInfoService {

    FileMetadataDTO upload(Long userId, MultipartFile file);

    FileDownload download(Long userId, Long fileId);

    void delete(Long userId, Long fileId);

    FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request);
}
