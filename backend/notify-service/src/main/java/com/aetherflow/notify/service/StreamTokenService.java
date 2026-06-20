package com.aetherflow.notify.service;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import com.aetherflow.common.security.JwtUserClaims;
import com.aetherflow.notify.dto.StreamTokenResponse;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;

@Service
public class StreamTokenService {

    private static final String STREAM_ROLE = "STREAM_NOTIFY";
    private static final long EXPIRES_IN_SECONDS = 60L;
    private static final long EXPIRES_IN_MINUTES = 1L;

    private final JwtTokenProvider tokenProvider;

    public StreamTokenService(JwtProperties jwtProperties, Environment environment) {
        this.tokenProvider = new JwtTokenProvider(streamProperties(jwtProperties), environment);
    }

    /**
     * Backwards-compatible constructor used by unit tests that do not have a Spring
     * {@link Environment} available. Secret validation is skipped because the validator
     * treats a null environment as a test-only signal.
     */
    public StreamTokenService(JwtProperties jwtProperties) {
        this(jwtProperties, null);
    }

    public StreamTokenResponse issue(Long userId, String username) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "authenticated user is required");
        }
        Instant expiresAt = Instant.now().plusSeconds(EXPIRES_IN_SECONDS);
        String token = tokenProvider.createToken(new JwtUserClaims(userId, username, List.of(STREAM_ROLE)));
        return new StreamTokenResponse(
                token,
                "stream",
                userId,
                expiresAt,
                EXPIRES_IN_SECONDS,
                List.of("notify-websocket"),
                "streamToken"
        );
    }

    public StreamTokenClaims validate(String token) {
        if (!StringUtils.hasText(token)) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "invalid stream token");
        }
        try {
            JwtUserClaims claims = tokenProvider.parseToken(token);
            if (claims.getRoles() == null || !claims.getRoles().contains(STREAM_ROLE)) {
                throw new BusinessException(ResultCode.UNAUTHORIZED, "invalid stream token");
            }
            return new StreamTokenClaims(claims.getUserId(), claims.getUsername());
        } catch (BusinessException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "invalid stream token");
        }
    }

    private static JwtProperties streamProperties(JwtProperties source) {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer(source.getIssuer() + ":stream");
        properties.setSecret(source.getSecret());
        properties.setExpireMinutes(EXPIRES_IN_MINUTES);
        properties.setHeader(source.getHeader());
        properties.setPrefix(source.getPrefix());
        return properties;
    }

    public record StreamTokenClaims(Long userId, String username) {
    }
}
