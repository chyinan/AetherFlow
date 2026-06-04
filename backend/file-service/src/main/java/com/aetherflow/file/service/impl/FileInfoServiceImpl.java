package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.entity.FileInfo;
import com.aetherflow.file.exception.StorageException;
import com.aetherflow.file.exception.UploadException;
import com.aetherflow.file.mapper.FileInfoMapper;
import com.aetherflow.file.model.FileAssetDtos.FileAssetMetadataView;
import com.aetherflow.file.model.FileAssetDtos.FileAssetPageResponse;
import com.aetherflow.file.model.FileMetricsResponse;
import com.aetherflow.file.model.FileStatusResponse;
import com.aetherflow.file.model.FileUploadProfile;
import com.aetherflow.file.model.MinioHealthView;
import com.aetherflow.file.model.ProgressState;
import com.aetherflow.file.model.UploadProgressView;
import com.aetherflow.file.service.FileDownload;
import com.aetherflow.file.service.FileGovernanceCacheService;
import com.aetherflow.file.service.FileHashService;
import com.aetherflow.file.service.FileInfoService;
import com.aetherflow.file.service.FileUploadGuardService;
import com.aetherflow.file.service.MinioHealthService;
import com.aetherflow.file.support.FileLogContext;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.SetBucketPolicyArgs;
import io.minio.errors.ErrorResponseException;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileInfoServiceImpl implements FileInfoService {

    private static final String STATUS_AVAILABLE = "AVAILABLE";
    private static final String STATUS_DELETED = "DELETED";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    private static final String FRONTEND_STATUS_READY = "ready";
    private static final String DEFAULT_SOURCE = "input";
    private static final String DEFAULT_ARTIFACT_KIND = "input";
    private static final String SOURCE_ARTIFACT = "artifact";
    private static final String ARTIFACT_KIND_SUMMARY = "summary";
    private static final String ARTIFACT_KIND_DOCUMENT = "document";
    private static final String WORKFLOW_EXPORT_PREFIX = "workflow/exports/";
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final FileInfoMapper fileInfoMapper;
    private final FileUploadGuardService fileUploadGuardService;
    private final FileHashService fileHashService;
    private final FileGovernanceCacheService cacheService;
    private final MinioHealthService minioHealthService;

    @PostConstruct
    void initializeStorageBucket() throws Exception {
        ensureBucket(minioProperties.getBucket());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileMetadataDTO upload(Long userId, MultipartFile file, String taskId) {
        String uploadTaskId = normalizeTaskId(taskId);
        String sha256 = null;
        Long fileId = null;
        boolean reserved = false;
        long start = System.nanoTime();
        try {
            requireUserId(userId);
            FileLogContext.putUserId(userId);
            cacheService.recordProgress(uploadTaskId, ProgressState.RECEIVED, 5, null, userId, null,
                    "Upload request received");
            cacheService.checkUploadRate(userId);

            FileUploadProfile profile = fileUploadGuardService.validate(file);

            cacheService.recordProgress(uploadTaskId, ProgressState.HASHING, 20, null, userId, null,
                    "Calculating SHA256");
            sha256 = fileHashService.sha256(file);
            cacheService.recordProgress(uploadTaskId, ProgressState.HASHING, 35, null, userId, sha256,
                    "SHA256 calculated");

            FileInfo reusableFile = findReusableFile(sha256);
            if (reusableFile != null) {
                FileMetadataDTO metadata = createDedupMetadata(userId, profile, sha256, reusableFile, uploadTaskId, start);
                fileId = metadata.getId();
                log.info("File upload dedupe hit traceId={} fileId={} userId={} hash={} size={}",
                        FileLogContext.traceId(), fileId, userId, sha256, profile.size());
                return metadata;
            }

            reserved = cacheService.tryReserveHashUpload(sha256, uploadTaskId);
            if (!reserved) {
                reusableFile = findReusableFile(sha256);
                if (reusableFile != null) {
                    FileMetadataDTO metadata = createDedupMetadata(userId, profile, sha256, reusableFile, uploadTaskId, start);
                    fileId = metadata.getId();
                    log.info("File upload dedupe hit after reservation miss traceId={} fileId={} userId={} hash={} size={}",
                            FileLogContext.traceId(), fileId, userId, sha256, profile.size());
                    return metadata;
                }
                throw new UploadException(ResultCode.CONFLICT, "same file upload is already in progress");
            }

            FileMetadataDTO metadata = uploadNewObject(userId, file, profile, sha256, uploadTaskId, start);
            fileId = metadata.getId();
            log.info("File upload completed traceId={} fileId={} userId={} hash={} size={}",
                    FileLogContext.traceId(), fileId, userId, sha256, profile.size());
            return metadata;
        } catch (RuntimeException exception) {
            if (reserved && StringUtils.hasText(sha256)) {
                cacheService.releaseHashReservation(sha256, uploadTaskId);
            }
            cacheService.recordProgress(uploadTaskId, ProgressState.FAILED, 100, fileId, userId, sha256,
                    exception.getMessage());
            throw exception;
        }
    }

    @Override
    public FileDownload download(Long userId, Long fileId) {
        requireUserId(userId);
        FileLogContext.putUserId(userId);
        FileLogContext.putFileId(fileId);
        FileInfo fileInfo = getAvailableFile(fileId);
        checkFileOwner(userId, fileInfo);

        FileDownload download = openDownload(fileInfo, fileId);
        log.info("File download opened traceId={} fileId={} userId={}",
                FileLogContext.traceId(), fileId, userId);
        return download;
    }

    @Override
    public FileDownload downloadInternal(Long fileId) {
        FileLogContext.putFileId(fileId);
        FileInfo fileInfo = getAvailableFile(fileId);
        FileDownload download = openDownload(fileInfo, fileId);
        log.info("Internal file download opened traceId={} fileId={}",
                FileLogContext.traceId(), fileId);
        return download;
    }

    private FileDownload openDownload(FileInfo fileInfo, Long fileId) {
        try {
            GetObjectResponse response = minioClient.getObject(GetObjectArgs.builder()
                    .bucket(fileInfo.getBucket())
                    .object(fileInfo.getObjectKey())
                    .build());
            return new FileDownload(
                    fileInfo.getOriginalName(),
                    resolveContentType(resolveMimeType(fileInfo)),
                    fileInfo.getFileSize(),
                    response
            );
        } catch (ErrorResponseException exception) {
            if (isMinioNotFound(exception)) {
                throw new BusinessException(ResultCode.NOT_FOUND, "file object not found in minio");
            }
            throw new StorageException("minio download failed");
        } catch (Exception exception) {
            throw new StorageException("minio download failed");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long userId, Long fileId) {
        requireUserId(userId);
        FileLogContext.putUserId(userId);
        FileLogContext.putFileId(fileId);
        FileInfo fileInfo = getExistingFile(fileId);
        checkFileOwner(userId, fileInfo);

        if (STATUS_DELETED.equals(fileInfo.getStatus())) {
            return;
        }

        fileInfo.setStatus(STATUS_DELETED);
        fileInfo.setUpdatedAt(LocalDateTime.now());
        fileInfoMapper.updateById(fileInfo);

        if (shouldRemovePhysicalObject(fileInfo)) {
            afterCommit(() -> {
                cacheService.evictHashCache(fileInfo.getHash());
                try {
                    removePhysicalObject(fileInfo);
                    log.info("File object removed traceId={} fileId={} userId={} hash={}",
                            FileLogContext.traceId(), fileId, userId, fileInfo.getHash());
                } catch (StorageException exception) {
                    log.error("File metadata deleted but object removal failed traceId={} fileId={} userId={} hash={}",
                            FileLogContext.traceId(), fileId, userId, fileInfo.getHash(), exception);
                }
            });
        } else {
            log.info("File metadata deleted, object retained by dedupe refs traceId={} fileId={} userId={} hash={}",
                    FileLogContext.traceId(), fileId, userId, fileInfo.getHash());
        }
    }

    @Override
    public FileMetadataDTO getMetadata(Long fileId) {
        return toDTO(getAvailableFile(fileId));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FileMetadataDTO createMetadata(Long userId, CreateFileMetadataRequestDTO request) {
        String contentType = resolveContentType(request.getContentType());
        Long ownerUserId = userId != null ? userId : request.getUserId();
        FileInfo fileInfo = buildFileInfo(
                ownerUserId,
                request.getBucket(),
                request.getObjectKey(),
                cleanOriginalName(request.getOriginalName()),
                contentType,
                request.getSize(),
                null,
                null
        );
        fileInfoMapper.insert(fileInfo);
        FileLogContext.putFileId(fileInfo.getId());
        log.info("Internal file metadata created traceId={} fileId={} userId={}",
                FileLogContext.traceId(), fileInfo.getId(), FileLogContext.userId());
        return toDTO(fileInfo);
    }

    @Override
    public FileAssetPageResponse listAssets(Long userId,
                                            String query,
                                            String type,
                                            String source,
                                            String artifactKind,
                                            String workflowId,
                                            int page,
                                            int pageSize) {
        requireUserId(userId);
        FileLogContext.putUserId(userId);

        int normalizedPage = Math.max(1, page);
        int normalizedPageSize = normalizePageSize(pageSize);
        if (unsupportedSource(source) || unsupportedArtifactKind(artifactKind) || StringUtils.hasText(workflowId)
                || unsupportedType(type)) {
            return emptyPage(normalizedPage, normalizedPageSize);
        }

        String normalizedType = normalize(type);
        String normalizedSource = normalize(source);
        String normalizedArtifactKind = normalize(artifactKind);
        LambdaQueryWrapper<FileInfo> countQuery = listQuery(userId, query, normalizedType, normalizedSource,
                normalizedArtifactKind);
        long total = safeLong(fileInfoMapper.selectCount(countQuery));
        if (total == 0) {
            return emptyPage(normalizedPage, normalizedPageSize);
        }

        long offset = (long) (normalizedPage - 1) * normalizedPageSize;
        LambdaQueryWrapper<FileInfo> pageQuery = listQuery(userId, query, normalizedType, normalizedSource,
                normalizedArtifactKind)
                .orderByDesc(FileInfo::getUpdatedAt)
                .orderByDesc(FileInfo::getId)
                .last("LIMIT " + offset + ", " + normalizedPageSize);
        List<FileAssetMetadataView> items = fileInfoMapper.selectList(pageQuery).stream()
                .map(this::toAsset)
                .toList();
        return new FileAssetPageResponse(normalizedPage, normalizedPageSize, total, items);
    }

    @Override
    public UploadProgressView getUploadProgress(Long userId, String taskId) {
        requireUserId(userId);
        FileLogContext.putUserId(userId);
        return cacheService.getProgress(userId, taskId);
    }

    @Override
    public FileStatusResponse getStatus() {
        MinioHealthView minioHealth = minioHealthService.check();
        return new FileStatusResponse(
                minioHealth.status(),
                safeLong(fileInfoMapper.countAvailableFiles()),
                cacheService.countUploadingTasks(),
                safeLong(fileInfoMapper.sumPhysicalStorageSize())
        );
    }

    @Override
    public FileMetricsResponse getMetrics() {
        MinioHealthView minioHealth = minioHealthService.check();
        return new FileMetricsResponse(
                minioHealth.status(),
                safeLong(fileInfoMapper.countAvailableFiles()),
                cacheService.countUploadingTasks(),
                safeLong(fileInfoMapper.sumPhysicalStorageSize()),
                safeLong(fileInfoMapper.averageUploadDurationMs())
        );
    }

    private FileMetadataDTO createDedupMetadata(Long userId,
                                                FileUploadProfile profile,
                                                String sha256,
                                                FileInfo reusableFile,
                                                String taskId,
                                                long start) {
        cacheService.recordProgress(taskId, ProgressState.DEDUPED, 70, null, userId, sha256,
                "Duplicate file found");
        FileInfo fileInfo = buildFileInfo(
                userId,
                reusableFile.getBucket(),
                reusableFile.getObjectKey(),
                profile.originalName(),
                profile.contentType(),
                profile.size(),
                sha256,
                elapsedMs(start)
        );
        fileInfo.setFileUrl(StringUtils.hasText(reusableFile.getFileUrl())
                ? reusableFile.getFileUrl()
                : buildFileUrl(reusableFile.getBucket(), reusableFile.getObjectKey()));
        try {
            fileInfoMapper.insert(fileInfo);
        } catch (RuntimeException exception) {
            throw new StorageException("save file metadata failed");
        }
        FileLogContext.putFileId(fileInfo.getId());
        afterCommit(() -> {
            cacheService.cacheHash(sha256, reusableFile.getId());
            cacheService.recordUpload(fileInfo.getId(), userId, taskId, sha256, ProgressState.COMPLETED);
            cacheService.recordProgress(taskId, ProgressState.COMPLETED, 100, fileInfo.getId(), userId, sha256,
                    "Duplicate file reused");
        });
        return toDTO(fileInfo);
    }

    private FileMetadataDTO uploadNewObject(Long userId,
                                            MultipartFile file,
                                            FileUploadProfile profile,
                                            String sha256,
                                            String taskId,
                                            long start) {
        String bucket = minioProperties.getBucket();
        String objectKey = buildObjectKey(sha256, profile.extension());

        try {
            cacheService.recordProgress(taskId, ProgressState.UPLOADING, 55, null, userId, sha256,
                    "Uploading object to MinIO");
            ensureBucket(bucket);
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .contentType(profile.contentType())
                    .stream(file.getInputStream(), profile.size(), -1)
                    .build());
        } catch (Exception exception) {
            throw new StorageException("minio upload failed");
        }

        try {
            cacheService.recordProgress(taskId, ProgressState.PERSISTING, 85, null, userId, sha256,
                    "Persisting file metadata");
            FileInfo fileInfo = buildFileInfo(
                    userId,
                    bucket,
                    objectKey,
                    profile.originalName(),
                    profile.contentType(),
                    profile.size(),
                    sha256,
                    elapsedMs(start)
            );
            fileInfoMapper.insert(fileInfo);
            FileLogContext.putFileId(fileInfo.getId());
            afterCommit(() -> {
                cacheService.cacheHash(sha256, fileInfo.getId());
                cacheService.recordUpload(fileInfo.getId(), userId, taskId, sha256, ProgressState.COMPLETED);
                cacheService.recordProgress(taskId, ProgressState.COMPLETED, 100, fileInfo.getId(), userId, sha256,
                        "Upload completed");
            });
            afterRollback(() -> removeObjectIfNoReferences(bucket, objectKey, sha256));
            return toDTO(fileInfo);
        } catch (RuntimeException exception) {
            removeObjectIfNoReferences(bucket, objectKey, sha256);
            throw new StorageException("save file metadata failed");
        }
    }

    private FileInfo findReusableFile(String sha256) {
        var cachedFileId = cacheService.findCachedHashFileId(sha256);
        if (cachedFileId.isPresent()) {
            FileInfo cachedFile = fileInfoMapper.selectById(cachedFileId.get());
            if (cachedFile != null
                    && STATUS_AVAILABLE.equals(cachedFile.getStatus())
                    && sha256.equals(cachedFile.getHash())) {
                return cachedFile;
            }
            cacheService.evictHashCache(sha256);
        }

        FileInfo databaseFile = fileInfoMapper.selectFirstAvailableByHash(sha256);
        if (databaseFile != null) {
            cacheService.cacheHash(sha256, databaseFile.getId());
        }
        return databaseFile;
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
        if (fileInfo.getUserId() == null) {
            throw new BusinessException(ResultCode.FORBIDDEN, "file owner is not available for public access");
        }
        if (fileInfo.getUserId() != null && !fileInfo.getUserId().equals(userId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "file does not belong to current user");
        }
    }

    private LambdaQueryWrapper<FileInfo> listQuery(Long userId,
                                                   String queryText,
                                                   String type,
                                                   String source,
                                                   String artifactKind) {
        LambdaQueryWrapper<FileInfo> query = new LambdaQueryWrapper<FileInfo>()
                .eq(FileInfo::getUserId, userId)
                .eq(FileInfo::getStatus, STATUS_AVAILABLE);
        if (StringUtils.hasText(queryText)) {
            String keyword = queryText.trim();
            query.and(wrapper -> wrapper.like(FileInfo::getOriginalName, keyword)
                    .or()
                    .like(FileInfo::getObjectKey, keyword)
                    .or()
                    .like(FileInfo::getContentType, keyword)
                    .or()
                    .like(FileInfo::getMimeType, keyword));
        }
        applyTypeFilter(query, type);
        applySourceFilter(query, source);
        applyArtifactKindFilter(query, artifactKind);
        return query;
    }

    private void applySourceFilter(LambdaQueryWrapper<FileInfo> query, String source) {
        if (!StringUtils.hasText(source)) {
            return;
        }
        if (SOURCE_ARTIFACT.equals(source)) {
            query.likeRight(FileInfo::getObjectKey, WORKFLOW_EXPORT_PREFIX);
            return;
        }
        query.notLikeRight(FileInfo::getObjectKey, WORKFLOW_EXPORT_PREFIX);
    }

    private void applyArtifactKindFilter(LambdaQueryWrapper<FileInfo> query, String artifactKind) {
        if (!StringUtils.hasText(artifactKind)) {
            return;
        }
        if (DEFAULT_ARTIFACT_KIND.equals(artifactKind)) {
            query.notLikeRight(FileInfo::getObjectKey, WORKFLOW_EXPORT_PREFIX);
            return;
        }
        if (ARTIFACT_KIND_SUMMARY.equals(artifactKind)) {
            query.likeRight(FileInfo::getObjectKey, WORKFLOW_EXPORT_PREFIX)
                    .and(wrapper -> wrapper.like(FileInfo::getOriginalName, ".md")
                            .or()
                            .like(FileInfo::getOriginalName, ".markdown")
                            .or()
                            .like(FileInfo::getOriginalName, ".txt")
                            .or()
                            .like(FileInfo::getOriginalName, ".json"));
            return;
        }
        query.likeRight(FileInfo::getObjectKey, WORKFLOW_EXPORT_PREFIX);
    }

    private void applyTypeFilter(LambdaQueryWrapper<FileInfo> query, String type) {
        if (!StringUtils.hasText(type)) {
            return;
        }
        if ("audio".equals(type)) {
            query.and(wrapper -> wrapper.likeRight(FileInfo::getContentType, "audio/")
                    .or()
                    .likeRight(FileInfo::getMimeType, "audio/")
                    .or()
                    .like(FileInfo::getOriginalName, ".mp3")
                    .or()
                    .like(FileInfo::getOriginalName, ".wav")
                    .or()
                    .like(FileInfo::getOriginalName, ".m4a"));
            return;
        }
        if ("video".equals(type)) {
            query.and(wrapper -> wrapper.likeRight(FileInfo::getContentType, "video/")
                    .or()
                    .likeRight(FileInfo::getMimeType, "video/")
                    .or()
                    .like(FileInfo::getOriginalName, ".mp4")
                    .or()
                    .like(FileInfo::getOriginalName, ".mov")
                    .or()
                    .like(FileInfo::getOriginalName, ".mkv"));
        }
    }

    private FileAssetPageResponse emptyPage(int page, int pageSize) {
        return new FileAssetPageResponse(page, pageSize, 0, List.of());
    }

    private FileAssetMetadataView toAsset(FileInfo fileInfo) {
        String mime = resolveContentType(resolveMimeType(fileInfo));
        String name = StringUtils.hasText(fileInfo.getOriginalName())
                ? fileInfo.getOriginalName()
                : objectName(fileInfo.getObjectKey(), fileInfo.getId());
        return new FileAssetMetadataView(
                fileInfo.getId(),
                String.valueOf(fileInfo.getId()),
                name,
                fileInfo.getOriginalName(),
                inferSource(fileInfo.getObjectKey()).equals(SOURCE_ARTIFACT) ? SOURCE_ARTIFACT : inferType(mime, name),
                inferSource(fileInfo.getObjectKey()),
                inferArtifactKind(fileInfo.getObjectKey(), name),
                fileInfo.getFileSize(),
                mime,
                FRONTEND_STATUS_READY,
                null,
                "File ready",
                fileInfo.getFileUrl(),
                fileInfo.getObjectKey(),
                fileInfo.getCreatedAt(),
                fileInfo.getUpdatedAt()
        );
    }

    private String objectName(String objectKey, Long id) {
        if (!StringUtils.hasText(objectKey)) {
            return "file-" + id;
        }
        int index = objectKey.lastIndexOf('/');
        return index >= 0 ? objectKey.substring(index + 1) : objectKey;
    }

    private String inferType(String mime, String name) {
        String normalizedMime = mime == null ? "" : mime.toLowerCase(Locale.ROOT);
        String normalizedName = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (normalizedMime.startsWith("audio/") || normalizedName.matches(".*\\.(mp3|wav|m4a|aac|flac|ogg)$")) {
            return "audio";
        }
        if (normalizedMime.startsWith("video/") || normalizedName.matches(".*\\.(mp4|mov|mkv|avi|webm)$")) {
            return "video";
        }
        return "document";
    }

    private String inferSource(String objectKey) {
        return isWorkflowExport(objectKey) ? SOURCE_ARTIFACT : DEFAULT_SOURCE;
    }

    private String inferArtifactKind(String objectKey, String name) {
        if (!isWorkflowExport(objectKey)) {
            return DEFAULT_ARTIFACT_KIND;
        }
        String normalizedName = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (normalizedName.matches(".*\\.(md|markdown|txt|json)$")) {
            return ARTIFACT_KIND_SUMMARY;
        }
        return ARTIFACT_KIND_DOCUMENT;
    }

    private boolean isWorkflowExport(String objectKey) {
        return StringUtils.hasText(objectKey) && objectKey.startsWith(WORKFLOW_EXPORT_PREFIX);
    }

    private boolean unsupportedSource(String source) {
        String normalized = normalize(source);
        return StringUtils.hasText(normalized) && !DEFAULT_SOURCE.equals(normalized) && !SOURCE_ARTIFACT.equals(normalized);
    }

    private boolean unsupportedArtifactKind(String artifactKind) {
        String normalized = normalize(artifactKind);
        return StringUtils.hasText(normalized)
                && !List.of(DEFAULT_ARTIFACT_KIND, "audio", "transcript", "subtitle", ARTIFACT_KIND_SUMMARY,
                ARTIFACT_KIND_DOCUMENT, "archive").contains(normalized);
    }

    private boolean unsupportedType(String type) {
        String normalized = normalize(type);
        return StringUtils.hasText(normalized)
                && !"audio".equals(normalized)
                && !"video".equals(normalized)
                && !"document".equals(normalized);
    }

    private int normalizePageSize(int pageSize) {
        if (pageSize <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }

    private String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim().toLowerCase(Locale.ROOT) : null;
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
                                   Long size,
                                   String sha256,
                                   Long uploadDuration) {
        LocalDateTime now = LocalDateTime.now();
        FileInfo fileInfo = new FileInfo();
        fileInfo.setUserId(userId);
        fileInfo.setUploaderId(userId);
        fileInfo.setBucket(bucket);
        fileInfo.setObjectKey(objectKey);
        fileInfo.setOriginalName(originalName);
        fileInfo.setContentType(resolveContentType(contentType));
        fileInfo.setMimeType(resolveContentType(contentType));
        fileInfo.setHash(sha256);
        fileInfo.setFileSize(size);
        fileInfo.setFileUrl(buildFileUrl(bucket, objectKey));
        fileInfo.setStatus(STATUS_AVAILABLE);
        fileInfo.setUploadDuration(uploadDuration);
        fileInfo.setCreatedAt(now);
        fileInfo.setUpdatedAt(now);
        return fileInfo;
    }

    private void ensureBucket(String bucket) throws Exception {
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
        minioClient.setBucketPolicy(SetBucketPolicyArgs.builder()
                .bucket(bucket)
                .config(publicReadPolicy(bucket))
                .build());
    }

    private String publicReadPolicy(String bucket) {
        return """
                {
                  "Version": "2012-10-17",
                  "Statement": [
                    {
                      "Effect": "Allow",
                      "Principal": {"AWS": ["*"]},
                      "Action": ["s3:GetObject"],
                      "Resource": ["arn:aws:s3:::%s/*"]
                    }
                  ]
                }
                """.formatted(bucket);
    }

    private String buildObjectKey(String sha256, String extension) {
        String safeExtension = StringUtils.hasText(extension)
                ? extension.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "")
                : "bin";
        if (!StringUtils.hasText(safeExtension) || safeExtension.length() > 20) {
            safeExtension = "bin";
        }
        return "objects/sha256/%s/%s/%s.%s".formatted(
                sha256.substring(0, 2),
                sha256.substring(2, 4),
                sha256,
                safeExtension
        );
    }

    private String cleanOriginalName(String originalName) {
        String cleaned = StringUtils.cleanPath(originalName == null ? "file" : originalName);
        return cleaned.replace("\\", "_").replace("/", "_");
    }

    private String resolveContentType(String contentType) {
        return StringUtils.hasText(contentType) ? contentType : DEFAULT_CONTENT_TYPE;
    }

    private String resolveMimeType(FileInfo fileInfo) {
        if (StringUtils.hasText(fileInfo.getMimeType())) {
            return fileInfo.getMimeType();
        }
        return fileInfo.getContentType();
    }

    private String buildFileUrl(String bucket, String objectKey) {
        String publicEndpoint = minioProperties.getPublicEndpoint();
        String normalizedEndpoint = publicEndpoint.endsWith("/")
                ? publicEndpoint.substring(0, publicEndpoint.length() - 1)
                : publicEndpoint;
        return normalizedEndpoint + "/" + bucket + "/" + objectKey;
    }

    private boolean shouldRemovePhysicalObject(FileInfo fileInfo) {
        if (StringUtils.hasText(fileInfo.getHash())) {
            return safeLong(fileInfoMapper.countAvailableByHash(fileInfo.getHash())) <= 0;
        }
        return safeLong(fileInfoMapper.countAvailableByObject(fileInfo.getBucket(), fileInfo.getObjectKey())) <= 0;
    }

    private void removeObjectIfNoReferences(String bucket, String objectKey, String sha256) {
        if (StringUtils.hasText(sha256) && safeLong(fileInfoMapper.countAvailableByHash(sha256)) > 0) {
            return;
        }
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .build());
        } catch (Exception exception) {
            log.warn("Rollback minio object failed traceId={} fileId={} userId={} bucket={} objectKey={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), bucket, objectKey,
                    exception);
        }
    }

    private void removePhysicalObject(FileInfo fileInfo) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(fileInfo.getBucket())
                    .object(fileInfo.getObjectKey())
                    .build());
        } catch (ErrorResponseException exception) {
            if (!isMinioNotFound(exception)) {
                throw new StorageException("minio delete failed");
            }
        } catch (Exception exception) {
            throw new StorageException("minio delete failed");
        }
    }

    private void afterCommit(Runnable runnable) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            runnable.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                runnable.run();
            }
        });
    }

    private void afterRollback(Runnable runnable) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_ROLLED_BACK
                        || status == TransactionSynchronization.STATUS_UNKNOWN) {
                    runnable.run();
                }
            }
        });
    }

    private FileMetadataDTO toDTO(FileInfo fileInfo) {
        return new FileMetadataDTO(
                fileInfo.getId(),
                fileInfo.getBucket(),
                fileInfo.getObjectKey(),
                fileInfo.getOriginalName(),
                resolveContentType(resolveMimeType(fileInfo)),
                fileInfo.getFileSize(),
                fileInfo.getFileUrl()
        );
    }

    private boolean isMinioNotFound(ErrorResponseException exception) {
        return "NoSuchKey".equals(exception.errorResponse().code())
                || "NoSuchBucket".equals(exception.errorResponse().code());
    }

    private String normalizeTaskId(String taskId) {
        return StringUtils.hasText(taskId) ? taskId : UUID.randomUUID().toString();
    }

    private Long elapsedMs(long start) {
        return (System.nanoTime() - start) / 1_000_000L;
    }

    private long safeLong(Long value) {
        return value == null ? 0L : value;
    }
}
