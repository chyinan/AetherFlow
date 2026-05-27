package com.aetherflow.gateway.filter;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import com.aetherflow.common.security.JwtUserClaims;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter implements GlobalFilter, Ordered {

    private static final List<String> PERMIT_ALL_PREFIXES = List.of(
            "/auth/",
            "/actuator/",
            "/health",
            "/swagger-ui",
            "/v3/api-docs"
    );

    private final JwtTokenProvider jwtTokenProvider;
    private final JwtProperties jwtProperties;
    private final ObjectMapper objectMapper;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        if (isPermitAll(path)) {
            return chain.filter(exchange);
        }

        String authorization = exchange.getRequest().getHeaders().getFirst(jwtProperties.getHeader());
        if (authorization == null || !authorization.startsWith(jwtProperties.getPrefix())) {
            return unauthorized(exchange, "missing bearer token");
        }

        try {
            JwtUserClaims claims = jwtTokenProvider.parseToken(authorization);
            ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                    .header("X-User-Id", String.valueOf(claims.getUserId()))
                    .header("X-Username", claims.getUsername())
                    .header("X-Roles", String.join(",", claims.getRoles()))
                    .build();
            return chain.filter(exchange.mutate().request(mutatedRequest).build());
        } catch (RuntimeException exception) {
            return unauthorized(exchange, "invalid bearer token");
        }
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private boolean isPermitAll(String path) {
        return PERMIT_ALL_PREFIXES.stream().anyMatch(path::startsWith);
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        byte[] bytes = serialize(Result.fail(ResultCode.UNAUTHORIZED, message));
        DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(bytes);
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    private byte[] serialize(Result<Void> result) {
        try {
            return objectMapper.writeValueAsString(result).getBytes(StandardCharsets.UTF_8);
        } catch (JsonProcessingException exception) {
            return "{\"code\":401,\"message\":\"unauthorized\"}".getBytes(StandardCharsets.UTF_8);
        }
    }
}

