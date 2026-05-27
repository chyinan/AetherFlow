package com.aetherflow.gateway.filter;

import com.aetherflow.gateway.support.ClientIpResolver;
import com.aetherflow.gateway.support.GatewayTrace;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.TimeUnit;

/**
 * Establishes request correlation and access logging at the first gateway hop.
 * Downstream services receive the same X-Trace-Id header for log stitching.
 */
@Slf4j
@Component
public class TraceLoggingFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long startNanos = System.nanoTime();
        String traceId = resolveTraceId(exchange);

        ServerHttpRequest requestWithTrace = exchange.getRequest().mutate()
                .headers(headers -> headers.set(GatewayTrace.TRACE_ID_HEADER, traceId))
                .build();
        ServerWebExchange tracedExchange = exchange.mutate().request(requestWithTrace).build();
        tracedExchange.getAttributes().put(GatewayTrace.TRACE_ID_ATTRIBUTE, traceId);
        exchange.getAttributes().put(GatewayTrace.TRACE_ID_ATTRIBUTE, traceId);
        exchange.getResponse().getHeaders().set(GatewayTrace.TRACE_ID_HEADER, traceId);

        String method = exchange.getRequest().getMethod() == null ? "UNKNOWN" : exchange.getRequest().getMethod().name();
        String path = exchange.getRequest().getURI().getPath();
        String clientIp = ClientIpResolver.resolve(exchange);

        return chain.filter(tracedExchange)
                .doOnError(exception -> log.error("gateway request failed traceId={} method={} path={} clientIp={}",
                        traceId, method, path, clientIp, exception))
                .doFinally(signalType -> {
                    long costMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNanos);
                    HttpStatusCode statusCode = exchange.getResponse().getStatusCode();
                    int status = statusCode == null ? 200 : statusCode.value();
                    log.info("gateway request traceId={} method={} path={} clientIp={} status={} costMs={} signal={}",
                            traceId, method, path, clientIp, status, costMs, signalType);
                });
    }

    @Override
    public int getOrder() {
        return -200;
    }

    private String resolveTraceId(ServerWebExchange exchange) {
        String incomingTraceId = exchange.getRequest().getHeaders().getFirst(GatewayTrace.TRACE_ID_HEADER);
        if (StringUtils.hasText(incomingTraceId)) {
            return incomingTraceId.trim();
        }
        return GatewayTrace.newTraceId();
    }
}
