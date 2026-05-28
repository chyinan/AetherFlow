package com.aetherflow.auth.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AuthTraceContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String traceId = resolveHeader(request, AuthRequestContext.TRACE_ID_HEADER, "traceId");
        String requestId = resolveHeader(request, AuthRequestContext.REQUEST_ID_HEADER, "requestId");
        String userId = resolveHeader(request, "X-User-Id", "userId");
        String previousTraceId = MDC.get("traceId");
        String previousRequestId = MDC.get("requestId");
        String previousUserId = MDC.get("userId");

        response.setHeader(AuthRequestContext.TRACE_ID_HEADER, traceId);
        response.setHeader(AuthRequestContext.REQUEST_ID_HEADER, requestId);

        MDC.put("traceId", traceId);
        MDC.put("requestId", requestId);
        MDC.put("userId", userId);
        try {
            log.info("auth request traceId={} requestId={} userId={} method={} path={} clientIp={} userAgent={}",
                    traceId,
                    requestId,
                    userId,
                    request.getMethod(),
                    request.getRequestURI(),
                    request.getRemoteAddr(),
                    safeValue(request.getHeader("User-Agent")));
            filterChain.doFilter(request, response);
        } finally {
            restoreMdc("traceId", previousTraceId);
            restoreMdc("requestId", previousRequestId);
            restoreMdc("userId", previousUserId);
        }
    }

    private String resolveHeader(HttpServletRequest request, String headerName, String mdcKey) {
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

    private String safeValue(String value) {
        return StringUtils.hasText(value) ? value.trim() : "-";
    }

    private void restoreMdc(String key, String previousValue) {
        if (previousValue == null) {
            MDC.remove(key);
        } else {
            MDC.put(key, previousValue);
        }
    }
}
