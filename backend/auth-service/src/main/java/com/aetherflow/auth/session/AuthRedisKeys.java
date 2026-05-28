package com.aetherflow.auth.session;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;

public final class AuthRedisKeys {

    private static final String AUTH_PREFIX = "auth:";
    private static final String GATEWAY_BLACKLIST_PREFIX = "aetherflow:gateway:token:blacklist:";

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

    public static String gatewayBlacklistKey(String token) {
        return GATEWAY_BLACKLIST_PREFIX + sha256(cleanBearerPrefix(token));
    }

    public static String loginFailureKey(String username) {
        return AUTH_PREFIX + "login:fail:" + Objects.requireNonNull(username, "username must not be null").trim();
    }

    public static String loginRateKey(String clientIp) {
        return AUTH_PREFIX + "rate:login:" + Objects.requireNonNull(clientIp, "clientIp must not be null").trim();
    }

    private static String cleanBearerPrefix(String token) {
        String value = Objects.requireNonNull(token, "token must not be null").trim();
        return value.startsWith("Bearer ") ? value.substring("Bearer ".length()) : value;
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 digest is not available", exception);
        }
    }
}
