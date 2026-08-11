// pattern: Imperative Shell
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
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
public class LocalChunkUploadService implements ChunkUploadService {

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    private static final Duration COMPLETION_LOCK_WAIT = Duration.ofSeconds(30);
    private static final DefaultRedisScript<Long> RELEASE_COMPLETION_LOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('del', KEYS[1]) "
                    + "else return 0 end",
            Long.class);
    private static final DefaultRedisScript<Long> RENEW_COMPLETION_LOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('pexpire', KEYS[1], ARGV[2]) "
                    + "else return 0 end",
            Long.class);

    private final FileInfoService fileInfoService;
    private final Path rootDirectory;
    private final StringRedisTemplate redisTemplate;
    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final FileUploadProperties uploadProperties;
    private final Map<String, UploadSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, CompletedUpload> completedUploads = new ConcurrentHashMap<>();
    private final Object[] completionLocks = createCompletionLocks();
    private final ScheduledExecutorService completionLockRenewalExecutor =
            Executors.newScheduledThreadPool(4, runnable -> {
                Thread thread = new Thread(runnable, "aetherflow-chunk-upload-lock-renewal");
                thread.setDaemon(true);
                return thread;
            });

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
        CompletedUpload completed = findCompletedUpload(uploadId);
        if (completed != null) {
            return completed.resultFor(userId);
        }

        if (sharedStorageEnabled()) {
            String lockToken = acquireCompletionLock(uploadId);
            CompletionClaim claim = null;
            AtomicBoolean lockActive = new AtomicBoolean(true);
            ScheduledFuture<?> lockRenewal = null;
            try {
                claim = acquireCompletionClaim(uploadId);
                if (claim.completed() != null) {
                    return claim.completed().resultFor(userId);
                }
                lockRenewal = scheduleCompletionLockRenewal(uploadId, lockToken, lockActive);
                return completeLocked(userId, uploadId, request, lockActive);
            } finally {
                if (lockRenewal != null) {
                    lockRenewal.cancel(false);
                }
                if (claim != null) {
                    releaseCompletionClaim(uploadId, claim.token());
                }
                releaseCompletionLock(uploadId, lockToken);
            }
        }

        synchronized (completionLock(uploadId)) {
            return completeLocked(userId, uploadId, request, null);
        }
    }

    private FileMetadataDTO completeLocked(Long userId,
                                            String uploadId,
                                            ChunkUploadDtos.CompleteRequest request,
                                            AtomicBoolean lockActive) {
        CompletedUpload completed = findCompletedUpload(uploadId);
        if (completed != null) {
            return completed.resultFor(userId);
        }
        UploadSession session = requireSession(userId, uploadId);
        ensureAllPartsReceived(session);
        ensureCompletionLockActive(lockActive);
        String expectedChecksum = request != null && StringUtils.hasText(request.checksum())
                ? normalizeChecksum(request.checksum())
                : session.checksum();
        Path assembled = session.directory().resolve("assembled.bin");
        boolean completionSucceeded = false;
        boolean completionStoredInSession = false;
        try {
            assemble(session, assembled);
            ensureAssembledSize(session, assembled);
            if (StringUtils.hasText(expectedChecksum)) {
                String actualChecksum = sha256(assembled);
                if (!expectedChecksum.equalsIgnoreCase(actualChecksum)) {
                    throw new UploadException(ResultCode.BAD_REQUEST, "chunk upload checksum mismatch");
                }
            }
            ensureCompletionLockActive(lockActive);
            PathMultipartFile multipartFile = new PathMultipartFile(
                    assembled,
                    "file",
                    session.originalName(),
                    session.contentType()
            );
            FileMetadataDTO result = fileInfoService.upload(userId, multipartFile, uploadId);
            CompletedUpload completedUpload = new CompletedUpload(userId, result);
            completionStoredInSession = persistCompletedUpload(uploadId, completedUpload);
            completedUploads.put(uploadId, completedUpload);
            completionSucceeded = true;
            return result;
        } finally {
            if (completionSucceeded) {
                if (!completionStoredInSession) {
                    removePersistedSession(uploadId);
                }
                deleteDirectory(session.directory());
                deleteRemoteParts(session);
            } else {
                deleteFile(assembled);
            }
        }
    }

    private CompletedUpload findCompletedUpload(String uploadId) {
        CompletedUpload completed = completedUploads.get(uploadId);
        if (completed != null) {
            return completed;
        }
        if (!sharedStorageEnabled()) {
            return null;
        }
        try {
            CompletedUpload persisted = readCompletedUpload(FileRedisKeys.chunkUploadResult(uploadId));
            if (persisted == null) {
                persisted = readCompletedUpload(FileRedisKeys.chunkUpload(uploadId));
            }
            if (persisted == null) {
                return null;
            }
            completedUploads.put(uploadId, persisted);
            return persisted;
        } catch (DataAccessException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                    "chunk upload completion store unavailable");
        }
    }

    private CompletedUpload readCompletedUpload(String key) {
        Map<Object, Object> values = redisTemplate.opsForHash().entries(key);
        if (!"true".equals(String.valueOf(values.get("completed")))) {
            return null;
        }
        return fromCompletedRedis(values);
    }

    private boolean persistCompletedUpload(String uploadId, CompletedUpload completed) {
        if (!sharedStorageEnabled()) {
            return false;
        }
        String resultKey = FileRedisKeys.chunkUploadResult(uploadId);
        try {
            writeCompletedUpload(resultKey, completed);
            return false;
        } catch (UploadException exception) {
            log.warn("Dedicated chunk upload completion store unavailable uploadId={}, keeping result in session",
                    uploadId, exception);
            try {
                redisTemplate.delete(resultKey);
            } catch (RuntimeException cleanupException) {
                log.warn("Failed to remove incomplete chunk upload completion result uploadId={}",
                        uploadId, cleanupException);
            }
            try {
                writeCompletedUpload(FileRedisKeys.chunkUpload(uploadId), completed);
                return true;
            } catch (UploadException fallbackException) {
                log.error("Chunk upload completion could not be persisted uploadId={}; using local result only",
                        uploadId, fallbackException);
                try {
                    redisTemplate.delete(FileRedisKeys.chunkUpload(uploadId));
                } catch (RuntimeException cleanupException) {
                    log.warn("Failed to remove incomplete chunk upload session uploadId={}",
                            uploadId, cleanupException);
                }
                return false;
            }
        }
    }

    private void writeCompletedUpload(String key, CompletedUpload completed) {
        FileMetadataDTO metadata = completed.metadata();
        if (metadata == null || metadata.getId() == null || metadata.getSize() == null) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                    "chunk upload completion result is invalid");
        }
        try {
            Map<String, String> values = new LinkedHashMap<>();
            values.put("completed", "true");
            values.put("completion.userId", String.valueOf(completed.userId()));
            values.put("completion.id", String.valueOf(metadata.getId()));
            values.put("completion.size", String.valueOf(metadata.getSize()));
            putNullableRedisValue(values, "completion.bucket", metadata.getBucket());
            putNullableRedisValue(values, "completion.objectKey", metadata.getObjectKey());
            putNullableRedisValue(values, "completion.originalName", metadata.getOriginalName());
            putNullableRedisValue(values, "completion.contentType", metadata.getContentType());
            putNullableRedisValue(values, "completion.url", metadata.getUrl());
            redisTemplate.opsForHash().putAll(key, values);
            if (!Boolean.TRUE.equals(redisTemplate.expire(key, sessionTtl()))) {
                throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                        "chunk upload completion expiry unavailable");
            }
        } catch (DataAccessException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                    "chunk upload completion store unavailable");
        }
    }

    private void putNullableRedisValue(Map<String, String> values, String field, String value) {
        if (value == null) {
            values.put(field + ":null", "true");
        } else {
            values.put(field, value);
        }
    }

    private CompletedUpload fromCompletedRedis(Map<Object, Object> values) {
        try {
            FileMetadataDTO metadata = new FileMetadataDTO(
                    Long.valueOf(requiredRedisValue(values, "completion.id")),
                    nullableRedisValue(values, "completion.bucket"),
                    nullableRedisValue(values, "completion.objectKey"),
                    nullableRedisValue(values, "completion.originalName"),
                    nullableRedisValue(values, "completion.contentType"),
                    Long.valueOf(requiredRedisValue(values, "completion.size")),
                    nullableRedisValue(values, "completion.url"));
            return new CompletedUpload(Long.valueOf(requiredRedisValue(values, "completion.userId")), metadata);
        } catch (RuntimeException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                    "chunk upload completion metadata is invalid");
        }
    }

    private String acquireCompletionLock(String uploadId) {
        String key = FileRedisKeys.chunkUploadLock(uploadId);
        String token = UUID.randomUUID().toString();
        Instant deadline = Instant.now().plus(COMPLETION_LOCK_WAIT);
        while (true) {
            try {
                Boolean acquired = redisTemplate.opsForValue().setIfAbsent(key, token, sessionTtl());
                if (Boolean.TRUE.equals(acquired)) {
                    return token;
                }
            } catch (DataAccessException exception) {
                throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                        "chunk upload completion lock unavailable");
            }
            if (!Instant.now().isBefore(deadline)) {
                throw new UploadException(ResultCode.CONFLICT,
                        "chunk upload completion is already in progress");
            }
            try {
                Thread.sleep(50L);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                        "chunk upload completion was interrupted");
            }
        }
    }

    private CompletionClaim acquireCompletionClaim(String uploadId) {
        String key = FileRedisKeys.chunkUploadClaim(uploadId);
        String token = UUID.randomUUID().toString();
        Instant deadline = Instant.now().plus(COMPLETION_LOCK_WAIT);
        while (true) {
            try {
                Boolean acquired = redisTemplate.opsForValue().setIfAbsent(key, token);
                if (Boolean.TRUE.equals(acquired)) {
                    return new CompletionClaim(token, null);
                }
                CompletedUpload completed = findCompletedUpload(uploadId);
                if (completed != null) {
                    return new CompletionClaim(null, completed);
                }
                if (!sessionExists(uploadId)) {
                    redisTemplate.delete(key);
                    continue;
                }
            } catch (DataAccessException exception) {
                throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                        "chunk upload completion claim unavailable");
            }
            if (!Instant.now().isBefore(deadline)) {
                throw new UploadException(ResultCode.CONFLICT,
                        "chunk upload completion is already in progress");
            }
            try {
                Thread.sleep(50L);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                        "chunk upload completion was interrupted");
            }
        }
    }

    private ScheduledFuture<?> scheduleCompletionLockRenewal(String uploadId,
                                                              String token,
                                                              AtomicBoolean lockActive) {
        long ttlMillis = sessionTtl().toMillis();
        long intervalMillis = Math.max(1_000L, ttlMillis / 3);
        return completionLockRenewalExecutor.scheduleAtFixedRate(
                () -> renewCompletionLock(uploadId, token, ttlMillis, lockActive),
                intervalMillis,
                intervalMillis,
                TimeUnit.MILLISECONDS);
    }

    private void renewCompletionLock(String uploadId,
                                     String token,
                                     long ttlMillis,
                                     AtomicBoolean lockActive) {
        try {
            Long renewedLock = redisTemplate.execute(
                    RENEW_COMPLETION_LOCK_SCRIPT,
                    List.of(FileRedisKeys.chunkUploadLock(uploadId)),
                    token,
                    String.valueOf(ttlMillis));
            if (!Long.valueOf(1L).equals(renewedLock)) {
                lockActive.set(false);
                log.warn("Chunk upload completion lock was lost uploadId={}", uploadId);
            }
        } catch (RuntimeException exception) {
            lockActive.set(false);
            log.warn("Failed to renew chunk upload completion lock uploadId={}", uploadId, exception);
        }
    }

    private void ensureCompletionLockActive(AtomicBoolean lockActive) {
        if (lockActive != null && !lockActive.get()) {
            throw new UploadException(ResultCode.CONFLICT,
                    "chunk upload completion lock was lost; please retry");
        }
    }

    private void releaseCompletionLock(String uploadId, String token) {
        releaseCompletionToken(FileRedisKeys.chunkUploadLock(uploadId), token);
    }

    private void releaseCompletionClaim(String uploadId, String token) {
        if (token != null) {
            releaseCompletionToken(FileRedisKeys.chunkUploadClaim(uploadId), token);
        }
    }

    private void releaseCompletionToken(String key, String token) {
        try {
            redisTemplate.execute(
                    RELEASE_COMPLETION_LOCK_SCRIPT,
                    List.of(key),
                    token);
        } catch (RuntimeException exception) {
            log.warn("Failed to release chunk upload token key={}", key, exception);
        }
    }

    @PreDestroy
    void shutdownCompletionLockRenewalExecutor() {
        completionLockRenewalExecutor.shutdownNow();
    }

    private String nullableRedisValue(Map<Object, Object> values, String field) {
        if ("true".equals(String.valueOf(values.get(field + ":null")))) {
            return null;
        }
        Object value = values.get(field);
        return value == null ? null : String.valueOf(value);
    }

    private void deleteFile(Path path) {
        if (path == null || !path.startsWith(rootDirectory)) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            log.warn("Failed to cleanup assembled chunk upload file path={}", path, exception);
        }
    }

    private record CompletionClaim(String token, CompletedUpload completed) {
    }

    @Override
    public void abort(Long userId, String uploadId) {
        requireUserId(userId);
        if (!StringUtils.hasText(uploadId)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "uploadId is required");
        }
        CompletedUpload completed = findCompletedUpload(uploadId);
        if (completed != null) {
            completed.resultFor(userId);
            return;
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

    private boolean sessionExists(String uploadId) {
        try {
            return !redisTemplate.opsForHash().entries(FileRedisKeys.chunkUpload(uploadId)).isEmpty();
        } catch (DataAccessException exception) {
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE,
                    "chunk upload session store unavailable");
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
