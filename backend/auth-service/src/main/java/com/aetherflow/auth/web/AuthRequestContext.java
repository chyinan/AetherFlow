package com.aetherflow.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.util.StringUtils;

import java.util.UUID;

public record AuthRequestContext(String clientIp, String userAgent, String traceId, String requestId) {

    public static final String TRACE_ID_HEADER = "X-Trace-Id";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    public static AuthRequestContext from(HttpServletRequest request) {
        return new AuthRequestContext(
                resolveClientIp(request),
                valueOrDefault(request.getHeader("User-Agent"), "-"),
                resolveCorrelationId(request, TRACE_ID_HEADER, "traceId"),
                resolveCorrelationId(request, REQUEST_ID_HEADER, "requestId")
        );
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            return forwardedFor.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (StringUtils.hasText(realIp)) {
            return realIp.trim();
        }
        return valueOrDefault(request.getRemoteAddr(), "-");
    }

    private static String resolveCorrelationId(HttpServletRequest request, String headerName, String mdcKey) {
        String headerValue = request.getHeader(headerName);
        if (StringUtils.hasText(headerValue)) {
            return headerValue.trim();
        }
        String mdcValue = MDC.get(mdcKey);
        if (StringUtils.hasText(mdcValue)) {
            return mdcValue;
        }
        return UUID.randomUUID().toString().replace("-", "");
    }

    private static String valueOrDefault(String value, String defaultValue) {
        return StringUtils.hasText(value) ? value.trim() : defaultValue;
    }
}
