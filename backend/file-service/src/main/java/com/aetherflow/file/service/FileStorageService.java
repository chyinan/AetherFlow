package com.aetherflow.file.service;

import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import org.springframework.web.multipart.MultipartFile;

public interface FileStorageService {

    FileMetadataDTO upload(Long userId, MultipartFile file);

    FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request);
}

