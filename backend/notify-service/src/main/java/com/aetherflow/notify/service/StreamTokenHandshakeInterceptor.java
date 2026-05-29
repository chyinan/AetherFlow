package com.aetherflow.notify.service;

import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class StreamTokenHandshakeInterceptor implements HandshakeInterceptor {

    private final StreamTokenService streamTokenService;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        try {
            StreamTokenService.StreamTokenClaims claims = streamTokenService.validate(resolveToken(request));
            attributes.put("userId", claims.userId());
            attributes.put("username", claims.username());
            return true;
        } catch (BusinessException exception) {
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

    private String resolveToken(ServerHttpRequest request) {
        if (request == null || request.getURI() == null) {
            return null;
        }
        var queryParams = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams();
        String token = queryParams.getFirst("streamToken");
        if (!StringUtils.hasText(token)) {
            token = queryParams.getFirst("token");
        }
        return token;
    }
}
