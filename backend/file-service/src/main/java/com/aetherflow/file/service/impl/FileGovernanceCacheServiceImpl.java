package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.file.config.FileUploadProperties;
import com.aetherflow.file.exception.UploadException;
import com.aetherflow.file.model.ProgressState;
import com.aetherflow.file.model.UploadProgressView;
import com.aetherflow.file.service.FileGovernanceCacheService;
import com.aetherflow.file.support.FileLogContext;
import com.aetherflow.file.support.FileRedisKeys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileGovernanceCacheServiceImpl implements FileGovernanceCacheService {

    private static final String HASH_LOCK_PREFIX = "LOCK:";

    private static final String FIELD_TASK_ID = "taskId";
    private static final String FIELD_FILE_ID = "fileId";
    private static final String FIELD_USER_ID = "userId";
    private static final String FIELD_HASH = "sha256";
    private static final String FIELD_STATUS = "status";
    private static final String FIELD_PERCENTAGE = "percentage";
    private static final String FIELD_MESSAGE = "message";
    private static final String FIELD_UPDATED_AT = "updatedAt";

    private static final Set<String> ACTIVE_STATES = Set.of(
            ProgressState.RECEIVED.name(),
            ProgressState.HASHING.name(),
            ProgressState.UPLOADING.name(),
            ProgressState.DEDUPED.name(),
            ProgressState.PERSISTING.name()
    );

    private final StringRedisTemplate redisTemplate;
    private final FileUploadProperties uploadProperties;

    @Override
    public void checkUploadRate(Long userId) {
        if (userId == null) {
            return;
        }
        try {
            String key = FileRedisKeys.uploadRate(userId);
            Long current = redisTemplate.opsForValue().increment(key);
            if (current != null && current == 1) {
                redisTemplate.expire(key, Duration.ofSeconds(uploadProperties.getRateLimitWindowSeconds()));
            }
            if (current != null && current > uploadProperties.getRateLimitCount()) {
                throw new UploadException(ResultCode.TOO_MANY_REQUESTS,
                        "upload frequency limit exceeded");
            }
        } catch (UploadException exception) {
            throw exception;
        } catch (DataAccessException exception) {
            log.warn("Redis upload rate limit skipped traceId={} fileId={} userId={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), exception);
        }
    }

    @Override
    public Optional<Long> findCachedHashFileId(String sha256) {
        if (!StringUtils.hasText(sha256)) {
            return Optional.empty();
        }
        try {
            String cached = redisTemplate.opsForValue().get(FileRedisKeys.hash(sha256));
            if (!StringUtils.hasText(cached)) {
                return Optional.empty();
            }
            if (cached.startsWith(HASH_LOCK_PREFIX)) {
                return Optional.empty();
            }
            return Optional.of(Long.parseLong(cached));
        } catch (NumberFormatException exception) {
            log.warn("Invalid Redis hash cache value traceId={} fileId={} userId={} sha256={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), sha256);
            return Optional.empty();
        } catch (DataAccessException exception) {
            log.warn("Redis hash cache lookup skipped traceId={} fileId={} userId={} sha256={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), sha256, exception);
            return Optional.empty();
        }
    }

    @Override
    public boolean tryReserveHashUpload(String sha256, String taskId) {
        if (!StringUtils.hasText(sha256) || !StringUtils.hasText(taskId)) {
            return false;
        }
        try {
            Boolean reserved = redisTemplate.opsForValue().setIfAbsent(
                    FileRedisKeys.hash(sha256),
                    HASH_LOCK_PREFIX + taskId,
                    Duration.ofSeconds(uploadProperties.getProgressTtlSeconds())
            );
            return Boolean.TRUE.equals(reserved);
        } catch (DataAccessException exception) {
            log.warn("Redis hash reservation skipped traceId={} fileId={} userId={} sha256={} taskId={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), sha256, taskId,
                    exception);
            return true;
        }
    }

    @Override
    public void releaseHashReservation(String sha256, String taskId) {
        if (!StringUtils.hasText(sha256) || !StringUtils.hasText(taskId)) {
            return;
        }
        try {
            String key = FileRedisKeys.hash(sha256);
            String current = redisTemplate.opsForValue().get(key);
            if ((HASH_LOCK_PREFIX + taskId).equals(current)) {
                redisTemplate.delete(key);
            }
        } catch (DataAccessException exception) {
            log.warn("Redis hash reservation release skipped traceId={} fileId={} userId={} sha256={} taskId={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), sha256, taskId,
                    exception);
        }
    }

    @Override
    public void cacheHash(String sha256, Long fileId) {
        if (!StringUtils.hasText(sha256) || fileId == null || fileId <= 0) {
            return;
        }
        try {
            redisTemplate.opsForValue().set(
                    FileRedisKeys.hash(sha256),
                    String.valueOf(fileId),
                    Duration.ofSeconds(uploadProperties.getHashCacheTtlSeconds())
            );
        } catch (DataAccessException exception) {
            log.warn("Redis hash cache write skipped traceId={} fileId={} userId={} sha256={}",
                    FileLogContext.traceId(), fileId, FileLogContext.userId(), sha256, exception);
        }
    }

    @Override
    public void evictHashCache(String sha256) {
        if (!StringUtils.hasText(sha256)) {
            return;
        }
        try {
            redisTemplate.delete(FileRedisKeys.hash(sha256));
        } catch (DataAccessException exception) {
            log.warn("Redis hash cache evict skipped traceId={} fileId={} userId={} sha256={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), sha256, exception);
        }
    }

    @Override
    public void recordUpload(Long fileId, Long userId, String taskId, String sha256, ProgressState state) {
        if (fileId == null || fileId <= 0) {
            return;
        }
        try {
            Map<String, String> values = new LinkedHashMap<>();
            values.put(FIELD_FILE_ID, String.valueOf(fileId));
            putIfPresent(values, FIELD_USER_ID, userId);
            putIfPresent(values, FIELD_TASK_ID, taskId);
            putIfPresent(values, FIELD_HASH, sha256);
            values.put(FIELD_STATUS, state.name());
            values.put(FIELD_UPDATED_AT, OffsetDateTime.now().toString());
            String key = FileRedisKeys.upload(fileId);
            redisTemplate.opsForHash().putAll(key, values);
            redisTemplate.expire(key, Duration.ofSeconds(uploadProperties.getUploadCacheTtlSeconds()));
        } catch (DataAccessException exception) {
            log.warn("Redis upload cache write skipped traceId={} fileId={} userId={}",
                    FileLogContext.traceId(), fileId, FileLogContext.userId(), exception);
        }
    }

    @Override
    public void recordProgress(String taskId,
                               ProgressState state,
                               int percentage,
                               Long fileId,
                               Long userId,
                               String sha256,
                               String message) {
        if (!StringUtils.hasText(taskId)) {
            return;
        }
        try {
            Map<String, String> values = new LinkedHashMap<>();
            values.put(FIELD_TASK_ID, taskId);
            values.put(FIELD_STATUS, state.name());
            values.put(FIELD_PERCENTAGE, String.valueOf(Math.max(0, Math.min(100, percentage))));
            values.put(FIELD_UPDATED_AT, OffsetDateTime.now().toString());
            putIfPresent(values, FIELD_FILE_ID, fileId);
            putIfPresent(values, FIELD_USER_ID, userId);
            putIfPresent(values, FIELD_HASH, sha256);
            putIfPresent(values, FIELD_MESSAGE, message);
            String key = FileRedisKeys.progress(taskId);
            redisTemplate.opsForHash().putAll(key, values);
            redisTemplate.expire(key, Duration.ofSeconds(uploadProperties.getProgressTtlSeconds()));
        } catch (DataAccessException exception) {
            log.warn("Redis progress cache write skipped traceId={} fileId={} userId={} taskId={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), taskId, exception);
        }
    }

    @Override
    public UploadProgressView getProgress(Long userId, String taskId) {
        if (!StringUtils.hasText(taskId)) {
            throw new UploadException(ResultCode.BAD_REQUEST, "upload task id must not be blank");
        }
        try {
            Map<Object, Object> entries = redisTemplate.opsForHash().entries(FileRedisKeys.progress(taskId));
            if (entries.isEmpty()) {
                throw new UploadException(ResultCode.NOT_FOUND, "upload progress not found");
            }
            Long ownerUserId = parseLong(entries.get(FIELD_USER_ID));
            if (userId == null) {
                throw new UploadException(ResultCode.UNAUTHORIZED, "missing gateway user context");
            }
            if (ownerUserId != null && !ownerUserId.equals(userId)) {
                throw new UploadException(ResultCode.FORBIDDEN, "upload progress does not belong to current user");
            }
            return new UploadProgressView(
                    taskId,
                    parseLong(entries.get(FIELD_FILE_ID)),
                    stringValue(entries.get(FIELD_STATUS), ProgressState.RECEIVED.name()),
                    parseInteger(entries.get(FIELD_PERCENTAGE), 0),
                    stringValue(entries.get(FIELD_MESSAGE), ""),
                    stringValue(entries.get(FIELD_HASH), null),
                    ownerUserId
            );
        } catch (UploadException exception) {
            throw exception;
        } catch (DataAccessException exception) {
            log.warn("Redis progress cache read failed traceId={} fileId={} userId={} taskId={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), taskId, exception);
            throw new UploadException(ResultCode.SERVICE_UNAVAILABLE, "upload progress cache unavailable");
        }
    }

    @Override
    public long countUploadingTasks() {
        long count = 0;
        try (Cursor<String> cursor = redisTemplate.scan(ScanOptions.scanOptions()
                .match(FileRedisKeys.progressPattern())
                .count(1000)
                .build())) {
            while (cursor.hasNext()) {
                String key = cursor.next();
                Object status = redisTemplate.opsForHash().get(key, FIELD_STATUS);
                if (status != null && ACTIVE_STATES.contains(status.toString())) {
                    count++;
                }
            }
        } catch (DataAccessException exception) {
            log.warn("Redis uploading task count unavailable traceId={} fileId={} userId={}",
                    FileLogContext.traceId(), FileLogContext.fileId(), FileLogContext.userId(), exception);
            return 0;
        }
        return count;
    }

    private void putIfPresent(Map<String, String> values, String field, Long value) {
        if (value != null) {
            values.put(field, String.valueOf(value));
        }
    }

    private void putIfPresent(Map<String, String> values, String field, String value) {
        if (StringUtils.hasText(value)) {
            values.put(field, value);
        }
    }

    private Long parseLong(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Integer parseInteger(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException exception) {
            return defaultValue;
        }
    }

    private String stringValue(Object value, String defaultValue) {
        return value == null ? defaultValue : value.toString();
    }
}
