package com.aetherflow.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.core.env.Environment;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;

public class JwtTokenProvider {

    private final JwtProperties properties;
    private final SecretKey key;

    /**
     * Backwards-compatible constructor used by unit tests; secrecy validation is skipped
     * because the active Spring environment is unavailable. Production code should prefer
     * {@link #JwtTokenProvider(JwtProperties, Environment)} so the fail-fast validator runs.
     */
    public JwtTokenProvider(JwtProperties properties) {
        this(properties, null);
    }

    public JwtTokenProvider(JwtProperties properties, Environment environment) {
        this.properties = properties;
        JwtSecretValidator.validate(properties.getSecret(), environment, "aetherflow.security.jwt.secret");
        this.key = Keys.hmacShaKeyFor(properties.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String createToken(JwtUserClaims userClaims) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(properties.getExpireMinutes(), ChronoUnit.MINUTES);
        return Jwts.builder()
                .issuer(properties.getIssuer())
                .subject(String.valueOf(userClaims.getUserId()))
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claim("username", userClaims.getUsername())
                .claim("roles", userClaims.getRoles())
                .signWith(key)
                .compact();
    }

    public JwtUserClaims parseToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(properties.getIssuer())
                .build()
                .parseSignedClaims(cleanBearerPrefix(token))
                .getPayload();
        Long userId = Long.valueOf(claims.getSubject());
        String username = claims.get("username", String.class);
        @SuppressWarnings("unchecked")
        List<String> rawRoles = claims.get("roles", List.class);
        // Guard against tokens minted without a roles claim (null) to prevent downstream NPE.
        List<String> roles = rawRoles == null ? List.of() : rawRoles;
        return new JwtUserClaims(userId, username, roles);
    }

    public boolean validateToken(String token) {
        try {
            parseToken(token);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private String cleanBearerPrefix(String token) {
        if (token != null && token.startsWith(properties.getPrefix())) {
            return token.substring(properties.getPrefix().length());
        }
        return token;
    }
}

