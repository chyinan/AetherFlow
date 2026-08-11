package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.exception.UploadException;
import com.aetherflow.file.config.FileUploadProperties;
import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.model.ChunkUploadDtos;
import com.aetherflow.file.model.PathMultipartFile;
import com.aetherflow.file.service.ChunkUploadService;
import com.aetherflow.file.service.FileInfoService;
import com.aetherflow.file.support.FileRedisKeys;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class LocalChunkUploadService implements ChunkUploadService {

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final FileInfoService fileInfoService;
    private final Path rootDirectory;
    private final StringRedisTemplate redisTemplate;
    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final FileUploadProperties uploadProperties;
    private final Map<String, UploadSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, CompletedUpload> completedUploads = new ConcurrentHashMap<>();
    private final Object[] completionLocks = createCompletionLocks();

    @Autowired
    public LocalChunkUploadService(FileInfoService fileInfoService,
                                   StringRedisTemplate redisTemplate,
                                   MinioClient minioClient,
                                   MinioProperties minioProperties,
                                   FileUploadProperties uploadProperties) {
        this(fileInfoService,
                Path.of(System.getProperty("java.io.tmpdir"), "aetherflow-file-uploads"),
                redisTemplate, minioClient, minioProperties, uploadProperties);
    }

    public LocalChunkUploadService(FileInfoService fileInfoService) {
        this(fileInfoService, Path.of(System.getProperty("java.io.tmpdir"), "aetherflow-file-uploads"));
    }

    LocalChunkUploadService(FileInfoService fileInfoService, Path rootDirectory) {
        this(fileInfoService, rootDirectory, null, null, null, null);
    }

    LocalChunkUploadService(FileInfoService fileInfoService,
                            Path rootDirectory,
                            FileUploadProperties uploadProperties) {
        this(fileInfoService, rootDirectory, null, null, null, uploadProperties);
    }

    private LocalChunkUploadService(FileInfoService fileInfoService,
                                    Path rootDirectory,
                                    StringRedisTemplate redisTemplate,
                                    MinioClient minioClient,
                                    MinioProperties minioProperties,
                                    FileUploadProperties uploadProperties) {
        this.fileInfoService = fileInfoService;
        this.rootDirectory = rootDirectory;
        this.redisTemplate = redisTemplate;
        this.minioClient = minioClient;
        this.minioProperties = minioProperties;
        this.uploadProperties = uploadProperties;
    }

    @Override
    public ChunkUploadDtos.InitResponse init(Long userId, ChunkUploadDtos.InitRequest request) {
        requireUserId(userId);
        if (request == null) {
            throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload init request is required");
        }
        String originalName = cleanOriginalName(request.originalName());
        if (!StringUtils.hasText(originalName)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "originalName is required");
        }
        long size = request.size() == null ? -1L : request.size();
        if (size < 0) {
            throw new UploadException(ResultCode.BAD_REQUEST, "file size must not be negative");
        }
        if (size > maxUploadSize()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "file size exceeds configured maximum");
        }
        int totalParts = request.totalParts() == null ? 0 : request.totalParts();
        if (totalParts <= 0) {
            throw new UploadException(ResultCode.BAD_REQUEST, "totalParts must be positive");
        }
        if (totalParts > maxChunkParts()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "totalParts exceeds configured maximum parts");
        }
        requireStorageConfiguration();

        String uploadId = UUID.randomUUID().toString().replace("-", "");
        Instant createdAt = Instant.now();
        UploadSession session = new UploadSession(
                uploadId,
                userId,
                originalName,
                resolveContentType(request.contentType()),
                size,
                totalParts,
                normalizeChecksum(request.checksum()),
                createdAt,
                rootDirectory.resolve(uploadId)
        );
        try {
            Files.createDirectories(session.directory());
        } catch (IOException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload temp directory unavailable");
        }
        try {
            persistSession(session);
        } catch (RuntimeException exception) {
            deleteDirectory(session.directory());
            throw exception;
        }
        return new ChunkUploadDtos.InitResponse(
                uploadId,
                originalName,
                session.contentType(),
                size,
                totalParts,
                createdAt.toString()
        );
    }

    @Override
    public ChunkUploadDtos.PartResponse uploadPart(Long userId, String uploadId, int partNumber, MultipartFile part) {
        UploadSession session = requireSession(userId, uploadId);
        if (partNumber <= 0 || partNumber > session.totalParts()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "partNumber is out of range");
        }
        if (part == null || part.isEmpty()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "chunk part must not be empty");
        }
        long size = part.getSize() > 0 ? part.getSize() : safeSize(part);
        if (size <= 0 || size > maxChunkSize()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "chunk part exceeds configured maximum size");
        }
        long previousSize = session.parts().getOrDefault(partNumber, 0L);
        long totalSize = session.parts().values().stream().mapToLong(Long::longValue).sum() - previousSize + size;
        if (totalSize > session.size()) {
            throw new UploadException(ResultCode.BAD_REQUEST, "chunk parts exceed declared file size");
        }
        if (sharedStorageEnabled()) {
            putRemotePart(session, partNumber, part);
        } else {
            Path partPath = partPath(session, partNumber);
            try (InputStream inputStream = part.getInputStream()) {
                Files.copy(inputStream, partPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException exception) {
                throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk part write failed");
            }
            size = safeSize(partPath);
        }
        session.parts().put(partNumber, size);
        try {
            persistPart(session, partNumber, size);
        } catch (RuntimeException exception) {
            if (sharedStorageEnabled()) {
                deleteRemotePart(session, partNumber);
            }
            throw exception;
        }
        return new ChunkUploadDtos.PartResponse(
                session.uploadId(),
                partNumber,
                size,
                session.parts().size(),
                session.totalParts(),
                session.parts().size() == session.totalParts()
        );
    }

    @Override
    public FileMetadataDTO complete(Long userId, String uploadId, ChunkUploadDtos.CompleteRequest request) {
        requireUserId(userId);
        if (!StringUtils.hasText(uploadId)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "uploadId is required");
        }
        CompletedUpload completed = completedUploads.get(uploadId);
        if (completed != null) {
            return completed.resultFor(userId);
        }
        synchronized (completionLock(uploadId)) {
            completed = completedUploads.get(uploadId);
            if (completed != null) {
                return completed.resultFor(userId);
            }
            UploadSession session = requireSession(userId, uploadId);
            ensureAllPartsReceived(session);
            String expectedChecksum = request != null && StringUtils.hasText(request.checksum())
                    ? normalizeChecksum(request.checksum())
                    : session.checksum();
            Path assembled = session.directory().resolve("assembled.bin");
            try {
                assemble(session, assembled);
                ensureAssembledSize(session, assembled);
                if (StringUtils.hasText(expectedChecksum)) {
                    String actualChecksum = sha256(assembled);
                    if (!expectedChecksum.equalsIgnoreCase(actualChecksum)) {
                        throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload checksum mismatch");
                    }
                }
                PathMultipartFile multipartFile = new PathMultipartFile(
                        assembled,
                        "file",
                        session.originalName(),
                        session.contentType()
                );
                FileMetadataDTO result = fileInfoService.upload(userId, multipartFile, uploadId);
                completedUploads.put(uploadId, new CompletedUpload(userId, result));
                return result;
            } finally {
                removePersistedSession(uploadId);
                deleteDirectory(session.directory());
                deleteRemoteParts(session);
            }
        }
    }

    @Override
    public void abort(Long userId, String uploadId) {
        requireUserId(userId);
        if (!StringUtils.hasText(uploadId)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "uploadId is required");
        }
        UploadSession session = findSession(uploadId);
        if (session == null) {
            return;
        }
        if (!session.userId().equals(userId)) {
            throw new UploadException(ResultCode.FORBIDDEN, "chunk upload session does not belong to current user");
        }
        removePersistedSession(uploadId);
        deleteDirectory(session.directory());
        deleteRemoteParts(session);
    }

    private void ensureAllPartsReceived(UploadSession session) {
        for (int partNumber = 1; partNumber <= session.totalParts(); partNumber++) {
            if (!session.parts().containsKey(partNumber)
                    || (!sharedStorageEnabled() && !Files.exists(partPath(session, partNumber)))) {
                throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload has missing parts");
            }
        }
    }

    private void assemble(UploadSession session, Path assembled) {
        try (OutputStream outputStream = Files.newOutputStream(assembled)) {
            for (int partNumber = 1; partNumber <= session.totalParts(); partNumber++) {
                if (sharedStorageEnabled()) {
                    try (InputStream inputStream = minioClient.getObject(GetObjectArgs.builder()
                            .bucket(minioProperties.getBucket())
                            .object(remotePartKey(session, partNumber))
                            .build())) {
                        inputStream.transferTo(outputStream);
                    }
                } else {
                    Files.copy(partPath(session, partNumber), outputStream);
                }
            }
        } catch (UploadException exception) {
            throw exception;
        } catch (Exception exception) {
            log.warn("Chunk upload assemble failed uploadId={}", session.uploadId(), exception);
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload assemble failed");
        }
    }

    private String sha256(Path path) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream inputStream = new DigestInputStream(Files.newInputStream(path), digest)) {
                inputStream.transferTo(OutputStream.nullOutputStream());
            }
            byte[] bytes = digest.digest();
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload checksum failed");
        }
    }

    private UploadSession requireSession(Long userId, String uploadId) {
        requireUserId(userId);
        if (!StringUtils.hasText(uploadId)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "uploadId is required");
        }
        UploadSession session = findSession(uploadId);
        if (session == null) {
            throw new UploadException(ResultCode.NOT_FOUND, "chunk upload session not found");
        }
        if (!session.userId().equals(userId)) {
            throw new UploadException(ResultCode.FORBIDDEN, "chunk upload session does not belong to current user");
        }
        return session;
    }

    private UploadSession findSession(String uploadId) {
        if (!redisEnabled()) {
            return sessions.get(uploadId);
        }
        try {
            Map<Object, Object> values = redisTemplate.opsForHash().entries(FileRedisKeys.chunkUpload(uploadId));
            if (values.isEmpty()) {
                return null;
            }
            UploadSession session = fromRedis(values, uploadId);
            ensureSessionDirectory(session.directory());
            sessions.put(uploadId, session);
            return session;
        } catch (DataAccessException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload session store unavailable");
        }
    }

    private void persistSession(UploadSession session) {
        if (!redisEnabled()) {
            sessions.put(session.uploadId(), session);
            return;
        }
        try {
            Map<String, String> values = new LinkedHashMap<>();
            values.put("userId", String.valueOf(session.userId()));
            values.put("originalName", session.originalName());
            values.put("contentType", session.contentType());
            values.put("size", String.valueOf(session.size()));
            values.put("totalParts", String.valueOf(session.totalParts()));
            values.put("checksum", session.checksum() == null ? "" : session.checksum());
            values.put("createdAt", session.createdAt().toString());
            redisTemplate.opsForHash().putAll(FileRedisKeys.chunkUpload(session.uploadId()), values);
            redisTemplate.expire(FileRedisKeys.chunkUpload(session.uploadId()), sessionTtl());
            sessions.put(session.uploadId(), session);
        } catch (DataAccessException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload session store unavailable");
        }
    }

    private void persistPart(UploadSession session, int partNumber, long size) {
        if (!redisEnabled()) {
            return;
        }
        try {
            String key = FileRedisKeys.chunkUpload(session.uploadId());
            redisTemplate.opsForHash().put(key, "part:" + partNumber, String.valueOf(size));
            redisTemplate.expire(key, sessionTtl());
        } catch (DataAccessException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload session store unavailable");
        }
    }

    private void removePersistedSession(String uploadId) {
        sessions.remove(uploadId);
        if (!redisEnabled()) {
            return;
        }
        try {
            redisTemplate.delete(FileRedisKeys.chunkUpload(uploadId));
        } catch (DataAccessException exception) {
            log.warn("Failed to remove persisted chunk upload session uploadId={}", uploadId, exception);
        }
    }

    private UploadSession fromRedis(Map<Object, Object> values, String uploadId) {
        try {
            Map<Integer, Long> parts = new ConcurrentHashMap<>();
            values.forEach((key, value) -> {
                String field = String.valueOf(key);
                if (field.startsWith("part:")) {
                    parts.put(Integer.parseInt(field.substring("part:".length())), Long.parseLong(String.valueOf(value)));
                }
            });
            return new UploadSession(
                    uploadId,
                    Long.valueOf(requiredRedisValue(values, "userId")),
                    requiredRedisValue(values, "originalName"),
                    requiredRedisValue(values, "contentType"),
                    Long.parseLong(requiredRedisValue(values, "size")),
                    Integer.parseInt(requiredRedisValue(values, "totalParts")),
                    emptyToNull(String.valueOf(values.getOrDefault("checksum", ""))),
                    Instant.parse(requiredRedisValue(values, "createdAt")),
                    rootDirectory.resolve(uploadId),
                    parts);
        } catch (RuntimeException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk upload session metadata is invalid");
        }
    }

    private String requiredRedisValue(Map<Object, Object> values, String field) {
        Object value = values.get(field);
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            throw new IllegalArgumentException("missing chunk upload session field " + field);
        }
        return String.valueOf(value);
    }

    private void requireStorageConfiguration() {
        boolean anySharedDependency = redisTemplate != null || minioClient != null
                || minioProperties != null;
        if (anySharedDependency && !sharedStorageEnabled()) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                    "chunk upload requires Redis session storage and MinIO part storage");
        }
    }

    private void ensureSessionDirectory(Path directory) {
        if (directory == null || !directory.startsWith(rootDirectory)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload session path is invalid");
        }
        try {
            Files.createDirectories(directory);
        } catch (IOException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                    "chunk upload temp directory unavailable");
        }
    }

    private boolean redisEnabled() {
        return redisTemplate != null;
    }

    private boolean sharedStorageEnabled() {
        return redisTemplate != null && minioClient != null && minioProperties != null;
    }

    private long maxUploadSize() {
        if (uploadProperties == null || uploadProperties.getMaxSize() == null) {
            return Long.MAX_VALUE;
        }
        return uploadProperties.getMaxSize().toBytes();
    }

    private long maxChunkSize() {
        if (uploadProperties == null || uploadProperties.getMaxChunkSize() == null) {
            return maxUploadSize();
        }
        return Math.min(maxUploadSize(), uploadProperties.getMaxChunkSize().toBytes());
    }

    private int maxChunkParts() {
        return uploadProperties == null ? 10_000 : Math.max(1, uploadProperties.getMaxChunkParts());
    }

    private Object completionLock(String uploadId) {
        return completionLocks[(uploadId.hashCode() & Integer.MAX_VALUE) % completionLocks.length];
    }

    private static Object[] createCompletionLocks() {
        Object[] locks = new Object[64];
        for (int index = 0; index < locks.length; index++) {
            locks[index] = new Object();
        }
        return locks;
    }

    private Duration sessionTtl() {
        long seconds = uploadProperties == null ? 3600L : uploadProperties.getChunkSessionTtlSeconds();
        return Duration.ofSeconds(Math.max(60L, seconds));
    }

    @Scheduled(fixedDelayString = "${aetherflow.file.upload.cleanup-interval-millis:300000}")
    public void cleanupExpiredSessions() {
        Instant cutoff = Instant.now().minus(sessionTtl());
        sessions.values().stream()
                .filter(session -> session.createdAt().isBefore(cutoff))
                .toList()
                .forEach(session -> {
                    if (sessions.remove(session.uploadId(), session)) {
                        removePersistedSession(session.uploadId());
                        deleteDirectory(session.directory());
                        deleteRemoteParts(session);
                    }
                });
    }

    private void putRemotePart(UploadSession session, int partNumber, MultipartFile part) {
        try {
            ensureRemoteBucket();
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(remotePartKey(session, partNumber))
                    .contentType(session.contentType())
                    .stream(part.getInputStream(), part.getSize(), -1)
                    .build());
        } catch (Exception exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "chunk part storage failed");
        }
    }

    private void ensureRemoteBucket() throws Exception {
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder()
                .bucket(minioProperties.getBucket()).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(minioProperties.getBucket()).build());
        }
    }

    private void deleteRemoteParts(UploadSession session) {
        if (!sharedStorageEnabled()) {
            return;
        }
        for (int partNumber = 1; partNumber <= session.totalParts(); partNumber++) {
            deleteRemotePart(session, partNumber);
        }
    }

    private void deleteRemotePart(UploadSession session, int partNumber) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(remotePartKey(session, partNumber))
                    .build());
        } catch (Exception exception) {
            log.warn("Failed to cleanup remote chunk part uploadId={} partNumber={}",
                    session.uploadId(), partNumber, exception);
        }
    }

    private String remotePartKey(UploadSession session, int partNumber) {
        return "chunk-uploads/" + session.uploadId() + "/part-%05d.bin".formatted(partNumber);
    }

    private void ensureAssembledSize(UploadSession session, Path assembled) {
        long actualSize = safeSize(assembled);
        if (actualSize != session.size()) {
            throw new UploadException(ResultCode.BAD_REQUEST,
                    "chunk upload size mismatch: expected " + session.size() + " but received " + actualSize);
        }
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "missing gateway user context");
        }
    }

    private Path partPath(UploadSession session, int partNumber) {
        return session.directory().resolve("part-%05d.bin".formatted(partNumber));
    }

    private String cleanOriginalName(String originalName) {
        String cleaned = StringUtils.cleanPath(originalName == null ? "" : originalName);
        return cleaned.replace("\\", "_").replace("/", "_");
    }

    private String resolveContentType(String contentType) {
        return StringUtils.hasText(contentType) ? contentType : DEFAULT_CONTENT_TYPE;
    }

    private String normalizeChecksum(String checksum) {
        return StringUtils.hasText(checksum) ? checksum.trim().toLowerCase(java.util.Locale.ROOT) : null;
    }

    private long safeSize(Path path) {
        try {
            return Files.size(path);
        } catch (IOException exception) {
            return 0L;
        }
    }

    private long safeSize(MultipartFile part) {
        try {
            return part.getBytes().length;
        } catch (IOException exception) {
            return 0L;
        }
    }

    private String emptyToNull(String value) {
        return StringUtils.hasText(value) ? value : null;
    }

    private void deleteDirectory(Path directory) {
        if (directory == null || !Files.exists(directory) || !directory.startsWith(rootDirectory)) {
            return;
        }
        try (var walk = Files.walk(directory)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    log.warn("Failed to delete chunk upload temp path path={}", path, exception);
                }
            });
        } catch (IOException exception) {
            log.warn("Failed to cleanup chunk upload temp dir dir={}", directory, exception);
        }
    }

    private record UploadSession(
            String uploadId,
            Long userId,
            String originalName,
            String contentType,
            long size,
            int totalParts,
            String checksum,
            Instant createdAt,
            Path directory,
            Map<Integer, Long> parts
    ) {

        private UploadSession(String uploadId,
                              Long userId,
                              String originalName,
                              String contentType,
                              long size,
                              int totalParts,
                              String checksum,
                              Instant createdAt,
                              Path directory) {
            this(uploadId, userId, originalName, contentType, size, totalParts, checksum, createdAt, directory,
                    new ConcurrentHashMap<>());
        }
    }

    private record CompletedUpload(Long userId, FileMetadataDTO metadata) {

        private FileMetadataDTO resultFor(Long requestedUserId) {
            if (!userId.equals(requestedUserId)) {
                throw new UploadException(ResultCode.FORBIDDEN, "chunk upload session does not belong to current user");
            }
            return metadata;
        }
    }
}
