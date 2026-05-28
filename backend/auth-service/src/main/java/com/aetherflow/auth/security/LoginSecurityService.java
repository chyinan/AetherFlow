package com.aetherflow.auth.security;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.session.AuthRedisKeys;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;

@Service
@RequiredArgsConstructor
public class LoginSecurityService {

    private final StringRedisTemplate redisTemplate;
    private final AuthProperties properties;

    public void checkLoginRateLimit(String clientIp) {
        String key = AuthRedisKeys.loginRateKey(clientIp);
        Long count = redisTemplate.opsForValue().increment(key);
        redisTemplate.expire(key, Duration.ofSeconds(properties.getSecurity().getLoginRateWindowSeconds()));
        if (count != null && count > properties.getSecurity().getLoginRateLimitPerMinute()) {
            throw new BusinessException(ResultCode.TOO_MANY_REQUESTS, "too many login requests");
        }
    }

    public void checkPasswordFailures(String username) {
        String value = redisTemplate.opsForValue().get(AuthRedisKeys.loginFailureKey(username));
        long failures = StringUtils.hasText(value) ? Long.parseLong(value) : 0;
        if (failures >= properties.getSecurity().getPasswordMaxFailures()) {
            throw new BusinessException(ResultCode.TOO_MANY_REQUESTS, "password error limit exceeded");
        }
    }

    public void recordPasswordFailure(String username) {
        String key = AuthRedisKeys.loginFailureKey(username);
        Long count = redisTemplate.opsForValue().increment(key);
        redisTemplate.expire(key, Duration.ofMinutes(properties.getSecurity().getPasswordFailureWindowMinutes()));
        if (count != null && count >= properties.getSecurity().getPasswordMaxFailures()) {
            throw new BusinessException(ResultCode.TOO_MANY_REQUESTS, "password error limit exceeded");
        }
    }

    public void clearPasswordFailures(String username) {
        redisTemplate.delete(AuthRedisKeys.loginFailureKey(username));
    }
}
