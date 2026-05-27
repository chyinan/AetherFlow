package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.entity.FileObject;
import com.aetherflow.file.mapper.FileObjectMapper;
import com.aetherflow.file.service.FileStorageService;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FileStorageServiceImpl implements FileStorageService {

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final FileObjectMapper fileObjectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileMetadataDTO upload(Long userId, MultipartFile file) {
        String objectKey = buildObjectKey(file.getOriginalFilename());
        try {
            ensureBucket(minioProperties.getBucket());
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectKey)
                    .contentType(file.getContentType())
                    .stream(file.getInputStream(), file.getSize(), -1)
                    .build());
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "minio upload failed");
        }

        CreateFileMetadataRequestDTO request = new CreateFileMetadataRequestDTO();
        request.setBucket(minioProperties.getBucket());
        request.setObjectKey(objectKey);
        request.setOriginalName(file.getOriginalFilename());
        request.setContentType(file.getContentType());
        request.setSize(file.getSize());
        return createMetadata(userId, request);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request) {
        FileObject object = new FileObject();
        object.setUserId(userId);
        object.setBucket(request.getBucket());
        object.setObjectKey(request.getObjectKey());
        object.setOriginalName(request.getOriginalName());
        object.setContentType(request.getContentType());
        object.setSize(request.getSize());
        object.setStatus("AVAILABLE");
        object.setCreatedAt(LocalDateTime.now());
        object.setUpdatedAt(LocalDateTime.now());
        fileObjectMapper.insert(object);
        return toDTO(object);
    }

    private void ensureBucket(String bucket) throws Exception {
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
    }

    private String buildObjectKey(String originalName) {
        String safeName = originalName == null ? "file" : originalName.replace("\\", "_").replace("/", "_");
        return "uploads/" + UUID.randomUUID() + "-" + safeName;
    }

    private FileMetadataDTO toDTO(FileObject object) {
        return new FileMetadataDTO(
                object.getId(),
                object.getBucket(),
                object.getObjectKey(),
                object.getOriginalName(),
                object.getContentType(),
                object.getSize(),
                minioProperties.getPublicEndpoint() + "/" + object.getBucket() + "/" + object.getObjectKey()
        );
    }
}

