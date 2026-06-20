package com.aetherflow.gateway.security;

import com.aetherflow.gateway.config.GatewaySecurityProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

@Slf4j
@Service
@RequiredArgsConstructor
public class RedisTokenBlacklistService implements TokenBlacklistService {

    private final ReactiveStringRedisTemplate redisTemplate;
    private final GatewaySecurityProperties properties;

    @Override
    public Mono<Boolean> isBlacklisted(String bearerToken) {
        if (!properties.getToken().isBlacklistEnabled() || !StringUtils.hasText(bearerToken)) {
            return Mono.just(false);
        }
        return redisTemplate.hasKey(buildRedisKey(bearerToken))
                .defaultIfEmpty(false)
                .onErrorResume(exception -> {
                    if (properties.getToken().isBlacklistFailClosed()) {
                        log.warn("redis token blacklist check failed, rejecting request (fail-closed) reason={}: {}",
                                exception.getClass().getSimpleName(), exception.getMessage());
                        return Mono.just(true);
                    }
                    log.warn("redis token blacklist check failed, allowing request to continue (fail-open) reason={}: {}",
                            exception.getClass().getSimpleName(), exception.getMessage());
                    return Mono.just(false);
                });
    }

    @Override
    public Mono<Boolean> blacklist(String bearerToken, Duration ttl) {
        if (!properties.getToken().isBlacklistEnabled() || !StringUtils.hasText(bearerToken) || ttl == null || ttl.isNegative() || ttl.isZero()) {
            return Mono.just(false);
        }
        return redisTemplate.opsForValue()
                .set(buildRedisKey(bearerToken), "revoked", ttl)
                .defaultIfEmpty(false)
                .onErrorResume(exception -> {
                    log.warn("redis token blacklist write failed reason={}: {}",
                            exception.getClass().getSimpleName(), exception.getMessage());
                    return Mono.just(false);
                });
    }

    String buildRedisKey(String bearerToken) {
        return properties.getToken().getBlacklistKeyPrefix() + sha256(cleanBearerPrefix(bearerToken));
    }

    private String cleanBearerPrefix(String bearerToken) {
        String value = bearerToken.trim();
        return value.startsWith("Bearer ") ? value.substring("Bearer ".length()) : value;
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 digest is not available", exception);
        }
    }
}
