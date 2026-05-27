package com.aetherflow.ai.cache;

import com.aetherflow.ai.config.AiTaskProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class RedisAiTaskCacheService implements AiTaskCacheService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AiTaskProperties properties;

    @Override
    public void markStatus(Long taskId, String status) {
        if (taskId == null) {
            return;
        }
        redisTemplate.opsForValue().set(AiTaskCacheKeys.statusKey(taskId), status, properties.getTaskCacheTtl());
    }

    @Override
    public void cacheResult(Long taskId, Map<String, Object> result) {
        if (taskId == null) {
            return;
        }
        redisTemplate.opsForValue().set(AiTaskCacheKeys.resultKey(taskId), writeJson(result), properties.getTaskCacheTtl());
    }

    @Override
    public void cacheError(Long taskId, String message) {
        if (taskId == null) {
            return;
        }
        redisTemplate.opsForValue().set(AiTaskCacheKeys.errorKey(taskId), message, properties.getTaskCacheTtl());
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            log.warn("Failed to serialize ai task cache value", exception);
            return "{}";
        }
    }
}
