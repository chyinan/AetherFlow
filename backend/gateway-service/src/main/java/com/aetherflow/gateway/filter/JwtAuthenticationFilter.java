package com.aetherflow.gateway.filter;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import com.aetherflow.common.security.JwtUserClaims;
import com.aetherflow.gateway.config.GatewaySecurityProperties;
import com.aetherflow.gateway.security.TokenBlacklistService;
import com.aetherflow.gateway.support.GatewayResponseWriter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Optional;

/**
 * Performs gateway-level authentication before requests reach business services.
 * The filter is intentionally placed after TraceLoggingFilter so every rejection
 * can still be correlated by X-Trace-Id.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter implements GlobalFilter, Ordered {

    private final JwtTokenProvider jwtTokenProvider;
    private final JwtProperties jwtProperties;
    private final GatewaySecurityProperties securityProperties;
    private final TokenBlacklistService tokenBlacklistService;
    private final GatewayResponseWriter responseWriter;

    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        if (!securityProperties.isAuthEnabled() || isPermitAll(path)) {
            return chain.filter(exchange);
        }

        String authorization = exchange.getRequest().getHeaders().getFirst(jwtProperties.getHeader());
        if (!StringUtils.hasText(authorization) || !authorization.startsWith(jwtProperties.getPrefix())) {
            return unauthorized(exchange, "missing bearer token");
        }

        return tokenBlacklistService.isBlacklisted(authorization)
                .flatMap(blacklisted -> {
                    if (Boolean.TRUE.equals(blacklisted)) {
                        log.warn("blocked blacklisted token path={}", path);
                        return unauthorized(exchange, "token has been revoked");
                    }
                    return authenticateAndForward(exchange, chain, authorization);
                });
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private boolean isPermitAll(String path) {
        return securityProperties.getPermitAll().stream()
                .anyMatch(pattern -> pathMatcher.match(pattern, path));
    }

    private Mono<Void> authenticateAndForward(ServerWebExchange exchange,
                                              GatewayFilterChain chain,
                                              String authorization) {
        try {
            JwtUserClaims claims = jwtTokenProvider.parseToken(authorization);
            ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                    .headers(headers -> {
                        headers.remove("X-User-Id");
                        headers.remove("X-Username");
                        headers.remove("X-Roles");
                    })
                    .header("X-User-Id", String.valueOf(claims.getUserId()))
                    .header("X-Username", Optional.ofNullable(claims.getUsername()).orElse(""))
                    .header("X-Roles", String.join(",", Optional.ofNullable(claims.getRoles()).orElseGet(java.util.List::of)))
                    .build();
            return chain.filter(exchange.mutate().request(mutatedRequest).build());
        } catch (RuntimeException exception) {
            log.warn("invalid jwt token path={} reason={}: {}",
                    exchange.getRequest().getURI().getPath(),
                    exception.getClass().getSimpleName(),
                    exception.getMessage());
            return unauthorized(exchange, "invalid bearer token");
        }
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        return responseWriter.write(exchange, HttpStatus.UNAUTHORIZED, ResultCode.UNAUTHORIZED, message);
    }
}

