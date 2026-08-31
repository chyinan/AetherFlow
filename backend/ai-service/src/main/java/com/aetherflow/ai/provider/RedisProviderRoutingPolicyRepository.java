package com.aetherflow.ai.provider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Slf4j
@Repository
@RequiredArgsConstructor
public class RedisProviderRoutingPolicyRepository implements ProviderRoutingPolicyRepository {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public ProviderRoutingPolicy load() {
        return loadFromKey(ProviderRedisKeys.POLICY);
    }

    @Override
    public ProviderRoutingPolicy load(Long userId) {
        if (userId == null || userId <= 0) {
            return load();
        }
        ProviderRoutingPolicy scoped = loadFromKey(ProviderRedisKeys.policy(userId));
        return scoped == null ? load() : scoped;
    }

    private ProviderRoutingPolicy loadFromKey(String key) {
        try {
            String json = redisTemplate.opsForValue().get(key);
            if (json == null || json.isBlank()) {
                return null;
            }
            return objectMapper.readValue(json, ProviderRoutingPolicy.class);
        } catch (RuntimeException | JsonProcessingException exception) {
            log.warn("Failed to load provider routing policy from Redis", exception);
            return null;
        }
    }

    @Override
    public void save(ProviderRoutingPolicy policy) {
        saveToKey(ProviderRedisKeys.POLICY, policy);
    }

    @Override
    public void save(Long userId, ProviderRoutingPolicy policy) {
        if (userId == null || userId <= 0) {
            save(policy);
            return;
        }
        saveToKey(ProviderRedisKeys.policy(userId), policy);
    }

    private void saveToKey(String key, ProviderRoutingPolicy policy) {
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(policy.normalized()));
        } catch (RuntimeException | JsonProcessingException exception) {
            log.warn("Failed to save provider routing policy to Redis", exception);
            throw new IllegalStateException("provider routing policy persistence failed", exception);
        }
    }
}
