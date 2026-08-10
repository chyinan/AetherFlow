package com.aetherflow.common.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.util.StringUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

// pattern: Functional Core
public final class InternalServiceTokenService {

    private static final int MINIMUM_SECRET_BYTES = 32;

    private final SecretKey signingKey;
    private final String issuer;
    private final Duration ttl;

    public InternalServiceTokenService(String secret, String issuer, Duration ttl) {
        if (!StringUtils.hasText(secret)
                || secret.getBytes(StandardCharsets.UTF_8).length < MINIMUM_SECRET_BYTES) {
            throw new IllegalArgumentException("internal token secret must contain at least 32 bytes");
        }
        if (!StringUtils.hasText(issuer)) {
            throw new IllegalArgumentException("internal token issuer is required");
        }
        if (ttl == null || ttl.isZero() || ttl.isNegative()) {
            throw new IllegalArgumentException("internal token ttl must be positive");
        }
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.issuer = issuer;
        this.ttl = ttl;
    }

    public String issue(String audience, Instant now) {
        requireAudience(audience);
        if (now == null) {
            throw new IllegalArgumentException("internal token issue time is required");
        }
        return Jwts.builder()
                .issuer(issuer)
                .audience().add(audience).and()
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .id(UUID.randomUUID().toString())
                .signWith(signingKey)
                .compact();
    }

    public boolean isValid(String token, String expectedAudience, Instant now) {
        if (!StringUtils.hasText(token) || !StringUtils.hasText(expectedAudience) || now == null) {
            return false;
        }
        try {
            Jwts.parser()
                    .verifyWith(signingKey)
                    .requireIssuer(issuer)
                    .requireAudience(expectedAudience)
                    .clock(() -> Date.from(now))
                    .build()
                    .parseSignedClaims(token);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private void requireAudience(String audience) {
        if (!StringUtils.hasText(audience)) {
            throw new IllegalArgumentException("internal token audience is required");
        }
    }
}
