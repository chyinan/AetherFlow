package com.aetherflow.auth.session;

import java.util.Objects;

public final class AuthRedisKeys {

    private static final String AUTH_PREFIX = "auth:";

    private AuthRedisKeys() {
    }

    public static String tokenKey(Long userId) {
        return AUTH_PREFIX + "token:" + Objects.requireNonNull(userId, "userId must not be null");
    }

    public static String refreshKey(Long userId) {
        return AUTH_PREFIX + "refresh:" + Objects.requireNonNull(userId, "userId must not be null");
    }

    public static String blacklistKey(String token) {
        return AUTH_PREFIX + "blacklist:" + Objects.requireNonNull(token, "token must not be null").trim();
    }

    public static String loginFailureKey(String username) {
        return AUTH_PREFIX + "login:fail:" + Objects.requireNonNull(username, "username must not be null").trim();
    }

    public static String loginRateKey(String clientIp) {
        return AUTH_PREFIX + "rate:login:" + Objects.requireNonNull(clientIp, "clientIp must not be null").trim();
    }
}
