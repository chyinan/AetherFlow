package com.aetherflow.gateway.support;

import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;

import java.util.UUID;

public final class GatewayTrace {

    public static final String TRACE_ID_HEADER = "X-Trace-Id";
    public static final String TRACE_ID_ATTRIBUTE = "aetherflow.traceId";

    private GatewayTrace() {
    }

    public static String resolve(ServerWebExchange exchange) {
        Object traceId = exchange.getAttribute(TRACE_ID_ATTRIBUTE);
        if (traceId instanceof String value && StringUtils.hasText(value)) {
            return value;
        }
        String headerTraceId = exchange.getRequest().getHeaders().getFirst(TRACE_ID_HEADER);
        if (StringUtils.hasText(headerTraceId)) {
            return headerTraceId;
        }
        return newTraceId();
    }

    public static String newTraceId() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
