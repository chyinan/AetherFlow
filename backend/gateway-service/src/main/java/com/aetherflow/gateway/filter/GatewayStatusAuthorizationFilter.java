package com.aetherflow.gateway.filter;

import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * 本地控制器不经过 Gateway 的 GlobalFilter，单独复用相同的令牌及角色校验。
 * 健康探针与下游业务路由保持原有处理链，避免重复鉴权或误封探针。
 */
@Component
@RequiredArgsConstructor
public class GatewayStatusAuthorizationFilter implements WebFilter, Ordered {

    private final JwtAuthenticationFilter authenticationFilter;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        if ("/gateway/status".equals(exchange.getRequest().getURI().getPath())) {
            return authenticationFilter.filter(exchange, chain::filter);
        }
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
