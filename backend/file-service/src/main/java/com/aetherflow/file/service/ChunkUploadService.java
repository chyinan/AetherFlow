package com.aetherflow.file.service;

import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.model.ChunkUploadDtos;
import org.springframework.web.multipart.MultipartFile;

public interface ChunkUploadService {

    ChunkUploadDtos.InitResponse init(Long userId, ChunkUploadDtos.InitRequest request);

    ChunkUploadDtos.PartResponse uploadPart(Long userId, String uploadId, int partNumber, MultipartFile part);

    FileMetadataDTO complete(Long userId, String uploadId, ChunkUploadDtos.CompleteRequest request);

    void abort(Long userId, String uploadId);
}
