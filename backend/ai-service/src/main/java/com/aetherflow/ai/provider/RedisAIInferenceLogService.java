package com.aetherflow.ai.provider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class RedisAIInferenceLogService implements AIInferenceLogService {

    private static final int MAX_LOGS = 200;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public void record(AIInferenceLog inferenceLog) {
        log.info("AI inference event type={}, provider={}, message={}, latencyMs={}, error={}",
                inferenceLog.eventType(), inferenceLog.provider(), inferenceLog.message(),
                inferenceLog.latencyMillis(), inferenceLog.errorMessage());
        try {
            redisTemplate.opsForList().leftPush(ProviderRedisKeys.INFERENCE_LOGS, objectMapper.writeValueAsString(inferenceLog));
            redisTemplate.opsForList().trim(ProviderRedisKeys.INFERENCE_LOGS, 0, MAX_LOGS - 1);
        } catch (RuntimeException | JsonProcessingException exception) {
            log.warn("Failed to record AI inference log to Redis", exception);
        }
    }

    @Override
    public List<AIInferenceLog> recent(int limit) {
        try {
            int boundedLimit = Math.max(1, Math.min(limit, MAX_LOGS));
            List<String> values = redisTemplate.opsForList().range(ProviderRedisKeys.INFERENCE_LOGS, 0, boundedLimit - 1);
            if (values == null || values.isEmpty()) {
                return List.of();
            }
            List<AIInferenceLog> logs = new ArrayList<>(values.size());
            for (String value : values) {
                logs.add(objectMapper.readValue(value, AIInferenceLog.class));
            }
            return logs;
        } catch (RuntimeException | JsonProcessingException exception) {
            log.warn("Failed to read AI inference logs from Redis", exception);
            return List.of();
        }
    }
}
