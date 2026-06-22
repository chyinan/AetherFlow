package com.aetherflow.auth.security;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.exception.UnauthorizedException;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtSecretValidator;
import com.aetherflow.common.security.JwtUserClaims;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
public class AuthTokenService {

    private static final String CLAIM_USERNAME = "username";
    private static final String CLAIM_ROLES = "roles";
    private static final String CLAIM_TOKEN_TYPE = "tokenType";
    private static final String TOKEN_TYPE_ACCESS = "ACCESS";
    private static final String TOKEN_TYPE_REFRESH = "REFRESH";

    private final JwtProperties accessProperties;
    private final AuthProperties authProperties;
    private final SecretKey accessKey;
    private final SecretKey refreshKey;

    public AuthTokenService(JwtProperties accessProperties, AuthProperties authProperties) {
        this(accessProperties, authProperties, null);
    }

    public AuthTokenService(JwtProperties accessProperties, AuthProperties authProperties, Environment environment) {
        this.accessProperties = accessProperties;
        this.authProperties = authProperties;
        // Fail fast in non-dev profiles if either the access or refresh secret is blank, weak,
        // or one of the known hardcoded defaults. See JwtSecretValidator for the exact rules.
        JwtSecretValidator.validate(accessProperties.getSecret(), environment, "aetherflow.security.jwt.secret");
        JwtSecretValidator.validate(authProperties.getToken().getRefreshSecret(), environment,
                "aetherflow.auth.token.refresh-secret");
        this.accessKey = Keys.hmacShaKeyFor(accessProperties.getSecret().getBytes(StandardCharsets.UTF_8));
        this.refreshKey = Keys.hmacShaKeyFor(authProperties.getToken().getRefreshSecret().getBytes(StandardCharsets.UTF_8));
    }

    public AuthTokenBundle issueTokenBundle(Long userId, String username, List<String> roles) {
        String accessToken = createToken(userId, username, roles, accessProperties.getIssuer(),
                accessProperties.getExpireMinutes(), accessKey, TOKEN_TYPE_ACCESS);
        String refreshToken = createToken(userId, username, roles, accessProperties.getIssuer(),
                authProperties.getToken().getRefreshExpireMinutes(), refreshKey, TOKEN_TYPE_REFRESH);
        return new AuthTokenBundle(
                accessToken,
                refreshToken,
                Duration.ofMinutes(accessProperties.getExpireMinutes()).getSeconds(),
                Duration.ofMinutes(authProperties.getToken().getRefreshExpireMinutes()).getSeconds()
        );
    }

    public JwtUserClaims parseAccessToken(String token) {
        return parseToken(token, accessKey, TOKEN_TYPE_ACCESS);
    }

    public JwtUserClaims parseRefreshToken(String token) {
        return parseToken(token, refreshKey, TOKEN_TYPE_REFRESH);
    }

    public boolean validateAccessToken(String token) {
        try {
            parseAccessToken(token);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public Duration accessTokenTtl() {
        return Duration.ofMinutes(accessProperties.getExpireMinutes());
    }

    public Duration refreshTokenTtl() {
        return Duration.ofMinutes(authProperties.getToken().getRefreshExpireMinutes());
    }

    public Duration accessTokenRemainingTtl(String token) {
        return remainingTtl(token, accessKey);
    }

    public boolean isRefreshToken(String token) {
        try {
            parseRefreshToken(token);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private String createToken(Long userId, String username, List<String> roles, String issuer,
                               long expireMinutes, SecretKey key, String tokenType) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(expireMinutes, java.time.temporal.ChronoUnit.MINUTES);
        return Jwts.builder()
                .issuer(issuer)
                .subject(String.valueOf(userId))
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claim(CLAIM_USERNAME, username)
                .claim(CLAIM_ROLES, roles)
                .claim(CLAIM_TOKEN_TYPE, tokenType)
                .signWith(key)
                .compact();
    }

    private JwtUserClaims parseToken(String token, SecretKey key, String expectedTokenType) {
        if (!StringUtils.hasText(token)) {
            throw new UnauthorizedException("missing token");
        }
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(accessProperties.getIssuer())
                .build()
                .parseSignedClaims(cleanBearerPrefix(token))
                .getPayload();
        String tokenType = claims.get(CLAIM_TOKEN_TYPE, String.class);
        if (!expectedTokenType.equals(tokenType)) {
            throw new UnauthorizedException("invalid token type");
        }
        Long userId = Long.valueOf(claims.getSubject());
        String username = claims.get(CLAIM_USERNAME, String.class);
        @SuppressWarnings("unchecked")
        List<String> rawRoles = claims.get(CLAIM_ROLES, List.class);
        // Guard against tokens minted without a roles claim (null) to prevent downstream NPE
        // in JwtUserClaims consumers (e.g. gateway filter, stream token service).
        List<String> roles = rawRoles == null ? List.of() : rawRoles;
        return new JwtUserClaims(userId, username, roles);
    }

    private Duration remainingTtl(String token, SecretKey key) {
        if (!StringUtils.hasText(token)) {
            return Duration.ZERO;
        }
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(accessProperties.getIssuer())
                .build()
                .parseSignedClaims(cleanBearerPrefix(token))
                .getPayload();
        Instant expiration = claims.getExpiration().toInstant();
        Duration ttl = Duration.between(Instant.now(), expiration);
        return ttl.isNegative() ? Duration.ZERO : ttl;
    }

    private String cleanBearerPrefix(String token) {
        String value = token.trim();
        if (value.startsWith(accessProperties.getPrefix())) {
            return value.substring(accessProperties.getPrefix().length());
        }
        return value;
    }
}
