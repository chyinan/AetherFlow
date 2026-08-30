package com.aetherflow.workflow.runtime.stream;

// pattern: Imperative Shell
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import com.aetherflow.common.security.JwtUserClaims;
import org.springframework.core.env.Environment;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;

@Service
public class WorkflowRuntimeStreamTokenService {

    private static final String WORKFLOW_ROLE_PREFIX = "STREAM_WORKFLOW:";
    private static final long EXPIRES_IN_SECONDS = 60L;
    private static final long EXPIRES_IN_MINUTES = 1L;

    private final JwtTokenProvider tokenProvider;

    @Autowired
    public WorkflowRuntimeStreamTokenService(JwtProperties jwtProperties, Environment environment) {
        this.tokenProvider = new JwtTokenProvider(streamProperties(jwtProperties), environment);
    }

    public WorkflowRuntimeStreamTokenService(JwtProperties jwtProperties) {
        this(jwtProperties, null);
    }

    public WorkflowStreamTokenResponse issue(Long userId, String username, String workflowId) {
        if (userId == null || userId <= 0) {
            throw invalidToken();
        }
        String normalizedWorkflowId = normalizedWorkflowId(workflowId);
        Instant expiresAt = Instant.now().plusSeconds(EXPIRES_IN_SECONDS);
        String token = tokenProvider.createToken(new JwtUserClaims(
                userId, username, List.of(WORKFLOW_ROLE_PREFIX + normalizedWorkflowId)));
        return new WorkflowStreamTokenResponse(
                token, "stream", userId, normalizedWorkflowId, expiresAt, EXPIRES_IN_SECONDS,
                List.of("workflow-runtime-websocket"), "streamToken"
        );
    }

    public StreamTokenClaims validate(String token, String workflowId) {
        String normalizedWorkflowId = normalizedWorkflowId(workflowId);
        if (!StringUtils.hasText(token)) {
            throw invalidToken();
        }
        try {
            JwtUserClaims claims = tokenProvider.parseToken(token);
            String expectedRole = WORKFLOW_ROLE_PREFIX + normalizedWorkflowId;
            if (claims.getRoles() == null || !claims.getRoles().contains(expectedRole)) {
                throw invalidToken();
            }
            return new StreamTokenClaims(claims.getUserId(), claims.getUsername(), normalizedWorkflowId);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw invalidToken();
        }
    }

    private String normalizedWorkflowId(String workflowId) {
        if (!StringUtils.hasText(workflowId)) {
            throw invalidToken();
        }
        try {
            long value = Long.parseLong(workflowId.trim());
            if (value <= 0) {
                throw new NumberFormatException("workflow id must be positive");
            }
            return String.valueOf(value);
        } catch (NumberFormatException exception) {
            throw invalidToken();
        }
    }

    private BusinessException invalidToken() {
        return new BusinessException(ResultCode.UNAUTHORIZED, "invalid workflow stream token");
    }

    private static JwtProperties streamProperties(JwtProperties source) {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer(source.getIssuer() + ":workflow-stream");
        properties.setSecret(source.getSecret());
        properties.setExpireMinutes(EXPIRES_IN_MINUTES);
        properties.setHeader(source.getHeader());
        properties.setPrefix(source.getPrefix());
        return properties;
    }

    public record StreamTokenClaims(Long userId, String username, String workflowId) {
    }
}
