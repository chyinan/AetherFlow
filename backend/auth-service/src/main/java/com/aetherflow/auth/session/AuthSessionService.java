package com.aetherflow.auth.session;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AuthSessionService {

    private static final String REVOKED = "revoked";
    private static final String TOKEN_PATTERN = "auth:token:*";
    private static final String LOGIN_FAILURE_PATTERN = "auth:login:fail:*";

    private final StringRedisTemplate redisTemplate;

    public void storeSession(Long userId, String accessToken, Duration accessTtl,
                             String refreshToken, Duration refreshTtl) {
        redisTemplate.opsForValue().set(AuthRedisKeys.tokenKey(userId), accessToken, accessTtl);
        redisTemplate.opsForValue().set(AuthRedisKeys.refreshKey(userId), refreshToken, refreshTtl);
    }

    public String getAccessToken(Long userId) {
        return redisTemplate.opsForValue().get(AuthRedisKeys.tokenKey(userId));
    }

    public String getRefreshToken(Long userId) {
        return redisTemplate.opsForValue().get(AuthRedisKeys.refreshKey(userId));
    }

    public boolean isRefreshTokenActive(Long userId, String refreshToken) {
        return refreshToken != null && refreshToken.equals(getRefreshToken(userId));
    }

    public void deleteSession(Long userId) {
        redisTemplate.delete(AuthRedisKeys.tokenKey(userId));
        redisTemplate.delete(AuthRedisKeys.refreshKey(userId));
    }

    public void blacklistToken(String token, Duration ttl) {
        if (!StringUtils.hasText(token) || ttl == null || ttl.isZero() || ttl.isNegative()) {
            return;
        }
        redisTemplate.opsForValue().set(AuthRedisKeys.blacklistKey(token), REVOKED, ttl);
        // Gateway validates blacklist entries by SHA-256(token), so auth writes both local and gateway contract keys.
        redisTemplate.opsForValue().set(AuthRedisKeys.gatewayBlacklistKey(token), REVOKED, ttl);
    }

    public boolean isBlacklisted(String token) {
        Boolean exists = redisTemplate.hasKey(AuthRedisKeys.blacklistKey(token));
        if (Boolean.TRUE.equals(exists)) {
            return true;
        }
        return Boolean.TRUE.equals(redisTemplate.hasKey(AuthRedisKeys.gatewayBlacklistKey(token)));
    }

    public AuthMetricsSnapshot metrics() {
        Set<String> tokenKeys = redisTemplate.keys(TOKEN_PATTERN);
        Set<String> failureKeys = redisTemplate.keys(LOGIN_FAILURE_PATTERN);
        long tokenCount = tokenKeys == null ? 0 : tokenKeys.size();
        long failureCount = failureKeys == null ? 0 : failureKeys.stream()
                .map(redisTemplate.opsForValue()::get)
                .filter(StringUtils::hasText)
                .mapToLong(this::parseLongSafely)
                .sum();
        return new AuthMetricsSnapshot(tokenCount, tokenCount, failureCount);
    }

    private long parseLongSafely(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return 0;
        }
    }
}
