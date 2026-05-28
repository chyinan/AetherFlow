package com.aetherflow.ai.provider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Slf4j
@Repository
@RequiredArgsConstructor
public class RedisProviderStateRepository implements ProviderStateRepository {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public ProviderCircuitSnapshot readCircuit(AiProviderType provider) {
        try {
            String json = redisTemplate.opsForValue().get(ProviderRedisKeys.circuit(provider));
            if (json == null || json.isBlank()) {
                return ProviderCircuitSnapshot.closed(provider);
            }
            return objectMapper.readValue(json, ProviderCircuitSnapshot.class);
        } catch (RuntimeException | JsonProcessingException exception) {
            log.warn("Failed to read provider circuit from Redis provider={}", provider, exception);
            return ProviderCircuitSnapshot.closed(provider);
        }
    }

    @Override
    public void saveCircuit(ProviderCircuitSnapshot snapshot, Duration ttl) {
        runSafely("save provider circuit", () -> {
            redisTemplate.opsForValue().set(ProviderRedisKeys.circuit(snapshot.provider()), objectMapper.writeValueAsString(snapshot), ttl);
            for (ProviderCircuitState state : ProviderCircuitState.values()) {
                String markerKey = ProviderRedisKeys.circuitMarker(snapshot.provider(), state);
                if (state == snapshot.state()) {
                    redisTemplate.opsForValue().set(markerKey, "1", ttl);
                } else {
                    redisTemplate.delete(markerKey);
                }
            }
        });
    }

    @Override
    public int incrementFailureCount(AiProviderType provider, Duration ttl) {
        try {
            String key = ProviderRedisKeys.failures(provider);
            Long value = redisTemplate.opsForValue().increment(key);
            redisTemplate.expire(key, ttl);
            return value == null ? 1 : value.intValue();
        } catch (RuntimeException exception) {
            log.warn("Failed to increment provider failure count provider={}", provider, exception);
            return 1;
        }
    }

    @Override
    public void resetFailureCount(AiProviderType provider) {
        runSafely("reset provider failure count", () -> redisTemplate.delete(ProviderRedisKeys.failures(provider)));
    }

    @Override
    public boolean tryAcquireHalfOpenProbe(AiProviderType provider, Duration ttl) {
        try {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(ProviderRedisKeys.halfOpenLock(provider), "1", ttl);
            return Boolean.TRUE.equals(acquired);
        } catch (RuntimeException exception) {
            log.warn("Failed to acquire provider half-open probe lock provider={}", provider, exception);
            return true;
        }
    }

    @Override
    public void releaseHalfOpenProbe(AiProviderType provider) {
        runSafely("release provider half-open probe lock", () -> redisTemplate.delete(ProviderRedisKeys.halfOpenLock(provider)));
    }

    @Override
    public void saveHealth(AiProviderHealth health, Duration ttl) {
        runSafely("save provider health", () ->
                redisTemplate.opsForValue().set(ProviderRedisKeys.health(health.provider()), objectMapper.writeValueAsString(health), ttl));
    }

    @Override
    public AiProviderHealth readHealth(AiProviderType provider) {
        try {
            String json = redisTemplate.opsForValue().get(ProviderRedisKeys.health(provider));
            if (json == null || json.isBlank()) {
                return AiProviderHealth.unknown(provider, "health not available");
            }
            return objectMapper.readValue(json, AiProviderHealth.class);
        } catch (RuntimeException | JsonProcessingException exception) {
            log.warn("Failed to read provider health provider={}", provider, exception);
            return AiProviderHealth.unknown(provider, "health read failed");
        }
    }

    @Override
    public void saveActiveProvider(AiProviderType provider, Duration ttl) {
        runSafely("save active provider", () -> redisTemplate.opsForValue().set(ProviderRedisKeys.ACTIVE_PROVIDER, provider.name(), ttl));
    }

    @Override
    public Optional<AiProviderType> readActiveProvider() {
        try {
            String value = redisTemplate.opsForValue().get(ProviderRedisKeys.ACTIVE_PROVIDER);
            if (value == null || value.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(AiProviderType.valueOf(value));
        } catch (RuntimeException exception) {
            log.warn("Failed to read active provider from Redis", exception);
            return Optional.empty();
        }
    }

    @Override
    public List<AiProviderType> readKnownProviders() {
        return Arrays.asList(AiProviderType.values());
    }

    private void runSafely(String action, RedisAction redisAction) {
        try {
            redisAction.run();
        } catch (RuntimeException | JsonProcessingException exception) {
            log.warn("Failed to {}", action, exception);
        }
    }

    @FunctionalInterface
    private interface RedisAction {
        void run() throws JsonProcessingException;
    }
}
