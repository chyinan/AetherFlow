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
        String remoteAddr = valueOrDefault(request.getRemoteAddr(), "-");
        // The X-Forwarded-For / X-Real-IP headers can be spoofed by the client when the
        // servlet engine sees a direct connection (remoteAddr is a public/unknown IP).
        // Trust these headers only when the immediate peer is a known reverse proxy or
        // loopback address; otherwise fall back to the raw TCP peer so rate limiting
        // and audit logs cannot be bypassed by forging a header.
        if (isTrustedForwarder(remoteAddr)) {
            String forwardedFor = request.getHeader("X-Forwarded-For");
            if (StringUtils.hasText(forwardedFor)) {
                // Take the left-most (original client) entry. When the chain contains
                // multiple trusted proxies the rightmost entries are those proxies, but
                // the original client is always the first one.
                return forwardedFor.split(",")[0].trim();
            }
            String realIp = request.getHeader("X-Real-IP");
            if (StringUtils.hasText(realIp)) {
                return realIp.trim();
            }
        }
        return remoteAddr;
    }

    /**
     * Returns true when the TCP peer ({@code remoteAddr}) is a loopback address. In a
     * properly deployed architecture the gateway or nginx runs on the same host (or in
     * the same Docker network with loopback-bound ports), so only connections coming
     * from 127.0.0.1 / ::1 should ever carry trusted forwarding headers.
     */
    private static boolean isTrustedForwarder(String remoteAddr) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return false;
        }
        return "127.0.0.1".equals(remoteAddr)
                || "0:0:0:0:0:0:0:1".equals(remoteAddr)
                || "::1".equals(remoteAddr);
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
