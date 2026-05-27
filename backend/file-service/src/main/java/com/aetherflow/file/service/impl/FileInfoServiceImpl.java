package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.entity.FileInfo;
import com.aetherflow.file.mapper.FileInfoMapper;
import com.aetherflow.file.service.FileDownload;
import com.aetherflow.file.service.FileInfoService;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.errors.ErrorResponseException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileInfoServiceImpl implements FileInfoService {

    private static final String STATUS_AVAILABLE = "AVAILABLE";
    private static final String STATUS_DELETED = "DELETED";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final FileInfoMapper fileInfoMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileMetadataDTO upload(Long userId, MultipartFile file) {
        requireUserId(userId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "upload file must not be empty");
        }

        String bucket = minioProperties.getBucket();
        String objectKey = buildObjectKey(file.getOriginalFilename());
        String contentType = resolveContentType(file.getContentType());

        try {
            ensureBucket(bucket);
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .contentType(contentType)
                    .stream(file.getInputStream(), file.getSize(), -1)
                    .build());
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "minio upload failed");
        }

        try {
            FileInfo fileInfo = buildFileInfo(
                    userId,
                    bucket,
                    objectKey,
                    cleanOriginalName(file.getOriginalFilename()),
                    contentType,
                    file.getSize()
            );
            fileInfoMapper.insert(fileInfo);
            return toDTO(fileInfo);
        } catch (RuntimeException exception) {
            removeObjectQuietly(bucket, objectKey);
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "save file metadata failed");
        }
    }

    @Override
    public FileDownload download(Long userId, Long fileId) {
        requireUserId(userId);
        FileInfo fileInfo = getAvailableFile(fileId);
        checkFileOwner(userId, fileInfo);

        try {
            GetObjectResponse response = minioClient.getObject(GetObjectArgs.builder()
                    .bucket(fileInfo.getBucket())
                    .object(fileInfo.getObjectKey())
                    .build());
            return new FileDownload(
                    fileInfo.getOriginalName(),
                    resolveContentType(fileInfo.getContentType()),
                    fileInfo.getFileSize(),
                    response
            );
        } catch (ErrorResponseException exception) {
            if (isMinioNotFound(exception)) {
                throw new BusinessException(ResultCode.NOT_FOUND, "file object not found in minio");
            }
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "minio download failed");
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "minio download failed");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long userId, Long fileId) {
        requireUserId(userId);
        FileInfo fileInfo = getExistingFile(fileId);
        checkFileOwner(userId, fileInfo);

        if (STATUS_DELETED.equals(fileInfo.getStatus())) {
            return;
        }

        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(fileInfo.getBucket())
                    .object(fileInfo.getObjectKey())
                    .build());
        } catch (ErrorResponseException exception) {
            if (!isMinioNotFound(exception)) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "minio delete failed");
            }
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "minio delete failed");
        }

        fileInfo.setStatus(STATUS_DELETED);
        fileInfo.setUpdatedAt(LocalDateTime.now());
        fileInfoMapper.updateById(fileInfo);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request) {
        FileInfo fileInfo = buildFileInfo(
                userId,
                request.getBucket(),
                request.getObjectKey(),
                cleanOriginalName(request.getOriginalName()),
                resolveContentType(request.getContentType()),
                request.getSize()
        );
        fileInfoMapper.insert(fileInfo);
        return toDTO(fileInfo);
    }

    private FileInfo getAvailableFile(Long fileId) {
        FileInfo fileInfo = getExistingFile(fileId);
        if (!STATUS_AVAILABLE.equals(fileInfo.getStatus())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "file is not available");
        }
        return fileInfo;
    }

    private FileInfo getExistingFile(Long fileId) {
        if (fileId == null || fileId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "file id is invalid");
        }
        FileInfo fileInfo = fileInfoMapper.selectById(fileId);
        if (fileInfo == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "file metadata not found");
        }
        return fileInfo;
    }

    private void checkFileOwner(Long userId, FileInfo fileInfo) {
        if (fileInfo.getUserId() != null && !fileInfo.getUserId().equals(userId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "file does not belong to current user");
        }
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "missing gateway user context");
        }
    }

    private FileInfo buildFileInfo(Long userId,
                                   String bucket,
                                   String objectKey,
                                   String originalName,
                                   String contentType,
                                   Long size) {
        LocalDateTime now = LocalDateTime.now();
        FileInfo fileInfo = new FileInfo();
        fileInfo.setUserId(userId);
        fileInfo.setBucket(bucket);
        fileInfo.setObjectKey(objectKey);
        fileInfo.setOriginalName(originalName);
        fileInfo.setContentType(contentType);
        fileInfo.setFileSize(size);
        fileInfo.setFileUrl(buildFileUrl(bucket, objectKey));
        fileInfo.setStatus(STATUS_AVAILABLE);
        fileInfo.setCreatedAt(now);
        fileInfo.setUpdatedAt(now);
        return fileInfo;
    }

    private void ensureBucket(String bucket) throws Exception {
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
    }

    private String buildObjectKey(String originalName) {
        LocalDate today = LocalDate.now();
        String extension = StringUtils.getFilenameExtension(cleanOriginalName(originalName));
        String suffix = "";
        if (StringUtils.hasText(extension)) {
            String safeExtension = extension.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
            if (StringUtils.hasText(safeExtension) && safeExtension.length() <= 20) {
                suffix = "." + safeExtension;
            }
        }
        return "uploads/%d/%02d/%02d/%s%s".formatted(
                today.getYear(),
                today.getMonthValue(),
                today.getDayOfMonth(),
                UUID.randomUUID(),
                suffix
        );
    }

    private String cleanOriginalName(String originalName) {
        String cleaned = StringUtils.cleanPath(originalName == null ? "file" : originalName);
        return cleaned.replace("\\", "_").replace("/", "_");
    }

    private String resolveContentType(String contentType) {
        return StringUtils.hasText(contentType) ? contentType : DEFAULT_CONTENT_TYPE;
    }

    private String buildFileUrl(String bucket, String objectKey) {
        String publicEndpoint = minioProperties.getPublicEndpoint();
        String normalizedEndpoint = publicEndpoint.endsWith("/")
                ? publicEndpoint.substring(0, publicEndpoint.length() - 1)
                : publicEndpoint;
        return normalizedEndpoint + "/" + bucket + "/" + objectKey;
    }

    private FileMetadataDTO toDTO(FileInfo fileInfo) {
        return new FileMetadataDTO(
                fileInfo.getId(),
                fileInfo.getBucket(),
                fileInfo.getObjectKey(),
                fileInfo.getOriginalName(),
                fileInfo.getContentType(),
                fileInfo.getFileSize(),
                fileInfo.getFileUrl()
        );
    }

    private boolean isMinioNotFound(ErrorResponseException exception) {
        return "NoSuchKey".equals(exception.errorResponse().code())
                || "NoSuchBucket".equals(exception.errorResponse().code());
    }

    private void removeObjectQuietly(String bucket, String objectKey) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .build());
        } catch (Exception exception) {
            log.warn("Rollback minio object failed, bucket={}, objectKey={}", bucket, objectKey, exception);
        }
    }
}
