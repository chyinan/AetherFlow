package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;

@Service
@RequiredArgsConstructor
public class GoogleOAuthRedirectStateService {

    private static final String STATE_PREFIX = "auth:oauth2:google:redirect:";

    private final StringRedisTemplate redisTemplate;
    private final AuthProperties authProperties;

    public void storeRedirectPath(String state, String redirectPath) {
        if (!StringUtils.hasText(state)) {
            return;
        }
        redisTemplate.opsForValue().set(key(state), normalizeRedirectPath(redirectPath),
                Duration.ofMinutes(authProperties.getOauth().getGoogle().getStateTtlMinutes()));
    }

    public String consumeRedirectPath(String state) {
        if (!StringUtils.hasText(state)) {
            return authProperties.getOauth().getGoogle().getDefaultRedirectPath();
        }
        String key = key(state);
        String redirectPath = redisTemplate.opsForValue().get(key);
        redisTemplate.delete(key);
        return normalizeRedirectPath(redirectPath);
    }

    private String normalizeRedirectPath(String redirectPath) {
        if (!StringUtils.hasText(redirectPath)) {
            return authProperties.getOauth().getGoogle().getDefaultRedirectPath();
        }
        String trimmed = redirectPath.trim();
        if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
            return authProperties.getOauth().getGoogle().getDefaultRedirectPath();
        }
        return trimmed;
    }

    private String key(String state) {
        return STATE_PREFIX + state.trim();
    }
}
