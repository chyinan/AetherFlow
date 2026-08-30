package com.aetherflow.workflow.runtime.stream;

// pattern: Imperative Shell
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

@Component
public class WorkflowRuntimeStreamHandshakeInterceptor implements HandshakeInterceptor {

    private static final String PATH_PREFIX = "/workflow/runtime/ws/";
    private static final int MAX_CURSOR_LENGTH = 256;

    private final WorkflowRuntimeStreamTokenService tokenService;
    private final WorkflowInstanceMapper workflowInstanceMapper;

    public WorkflowRuntimeStreamHandshakeInterceptor(WorkflowRuntimeStreamTokenService tokenService,
                                                     WorkflowInstanceMapper workflowInstanceMapper) {
        this.tokenService = tokenService;
        this.workflowInstanceMapper = workflowInstanceMapper;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        try {
            String workflowId = workflowId(request);
            WorkflowRuntimeStreamTokenService.StreamTokenClaims claims =
                    tokenService.validate(queryParam(request, "streamToken"), workflowId);
            WorkflowInstance instance = workflowInstanceMapper.selectById(Long.valueOf(workflowId));
            if (instance == null || instance.getUserId() == null) {
                reject(response, HttpStatus.NOT_FOUND);
                return false;
            }
            if (!instance.getUserId().equals(claims.userId())) {
                reject(response, HttpStatus.FORBIDDEN);
                return false;
            }
            String cursor = normalizedCursor(queryParam(request, "cursor"));
            attributes.put("userId", claims.userId());
            attributes.put("username", claims.username());
            attributes.put("workflowId", workflowId);
            if (cursor != null) {
                attributes.put("cursor", cursor);
            }
            return true;
        } catch (BusinessException | IllegalArgumentException exception) {
            reject(response, HttpStatus.UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request,
                               ServerHttpResponse response,
                               WebSocketHandler wsHandler,
                               Exception exception) {
        // No handshake state to clean up.
    }

    private String workflowId(ServerHttpRequest request) {
        if (request == null || request.getURI() == null) {
            throw new IllegalArgumentException("missing request URI");
        }
        String path = request.getURI().getPath();
        int prefixIndex = path.lastIndexOf(PATH_PREFIX);
        if (prefixIndex < 0) {
            throw new IllegalArgumentException("invalid workflow stream path");
        }
        String workflowId = path.substring(prefixIndex + PATH_PREFIX.length());
        if (!StringUtils.hasText(workflowId) || workflowId.contains("/")) {
            throw new IllegalArgumentException("invalid workflow stream path");
        }
        long parsed = Long.parseLong(workflowId);
        if (parsed <= 0) {
            throw new IllegalArgumentException("invalid workflow id");
        }
        return String.valueOf(parsed);
    }

    private String queryParam(ServerHttpRequest request, String name) {
        if (request == null || request.getURI() == null) {
            return null;
        }
        return UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst(name);
    }

    private String normalizedCursor(String cursor) {
        if (!StringUtils.hasText(cursor)) {
            return null;
        }
        String normalized = cursor.trim();
        if (normalized.length() > MAX_CURSOR_LENGTH) {
            throw new IllegalArgumentException("cursor is too long");
        }
        return normalized;
    }

    private void reject(ServerHttpResponse response, HttpStatus status) {
        if (response != null) {
            response.setStatusCode(status);
        }
    }
}
