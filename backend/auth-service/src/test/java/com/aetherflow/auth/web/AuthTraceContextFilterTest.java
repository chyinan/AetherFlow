package com.aetherflow.auth.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class AuthTraceContextFilterTest {

    @Test
    void preservesIncomingCorrelationHeadersAndAddsThemToMdcAndResponse() throws Exception {
        AuthTraceContextFilter filter = new AuthTraceContextFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/auth/me");
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader("X-Trace-Id", "trace-1");
        request.addHeader("X-Request-Id", "request-1");
        request.addHeader("X-User-Id", "7");

        AtomicReference<String> traceIdInChain = new AtomicReference<>();
        AtomicReference<String> requestIdInChain = new AtomicReference<>();
        AtomicReference<String> userIdInChain = new AtomicReference<>();
        FilterChain chain = (ServletRequest servletRequest, ServletResponse servletResponse) -> {
            traceIdInChain.set(MDC.get("traceId"));
            requestIdInChain.set(MDC.get("requestId"));
            userIdInChain.set(MDC.get("userId"));
        };

        filter.doFilter(request, response, chain);

        assertThat(traceIdInChain.get()).isEqualTo("trace-1");
        assertThat(requestIdInChain.get()).isEqualTo("request-1");
        assertThat(userIdInChain.get()).isEqualTo("7");
        assertThat(response.getHeader("X-Trace-Id")).isEqualTo("trace-1");
        assertThat(response.getHeader("X-Request-Id")).isEqualTo("request-1");
        assertThat(MDC.get("traceId")).isNull();
        assertThat(MDC.get("requestId")).isNull();
        assertThat(MDC.get("userId")).isNull();
    }
}
