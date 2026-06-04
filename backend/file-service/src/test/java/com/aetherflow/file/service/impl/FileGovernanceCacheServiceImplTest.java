package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.file.config.FileUploadProperties;
import com.aetherflow.file.exception.UploadException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileGovernanceCacheServiceImplTest {

    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private HashOperations<String, Object, Object> hashOperations;
    private FileGovernanceCacheServiceImpl service;

    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        hashOperations = mock(HashOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(redisTemplate.delete(any(String.class))).thenReturn(true);

        FileUploadProperties properties = new FileUploadProperties();
        service = new FileGovernanceCacheServiceImpl(redisTemplate, properties);
    }

    @Test
    void findCachedHashShouldIgnoreLockMarker() {
        when(valueOperations.get("file:hash:abc")).thenReturn("LOCK:task-1");

        Optional<Long> result = service.findCachedHashFileId("abc");

        assertThat(result).isEmpty();
    }

    @Test
    void reserveAndReleaseHashShouldUseSameKey() {
        when(valueOperations.setIfAbsent(eq("file:hash:abc"), eq("LOCK:task-1"), any())).thenReturn(true);
        when(valueOperations.get("file:hash:abc")).thenReturn("LOCK:task-1");

        assertThat(service.tryReserveHashUpload("abc", "task-1")).isTrue();
        service.releaseHashReservation("abc", "task-1");

        verify(valueOperations).setIfAbsent(eq("file:hash:abc"), eq("LOCK:task-1"), any());
        verify(valueOperations).get("file:hash:abc");
        verify(redisTemplate).delete("file:hash:abc");
    }

    @Test
    void evictHashCacheShouldDeleteHashKey() {
        service.evictHashCache("abc");

        verify(redisTemplate).delete("file:hash:abc");
    }

    @Test
    void getProgressShouldRejectDifferentUser() {
        when(hashOperations.entries("file:progress:task-2")).thenReturn(Map.of(
                "taskId", "task-2",
                "userId", "1001",
                "status", "COMPLETED",
                "percentage", "100"
        ));

        assertThatThrownBy(() -> service.getProgress(2002L, "task-2"))
                .isInstanceOfSatisfying(UploadException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
    }
}
