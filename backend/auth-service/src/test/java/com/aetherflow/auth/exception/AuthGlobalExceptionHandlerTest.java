package com.aetherflow.auth.exception;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class AuthGlobalExceptionHandlerTest {

    private final AuthGlobalExceptionHandler handler = new AuthGlobalExceptionHandler();

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    void handlesUnauthorizedExceptionWithTraceContext() {
        MDC.put("traceId", "trace-1");
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/auth/me");

        ResponseEntity<Result<Void>> response = handler.handleUnauthorizedException(
                new UnauthorizedException("missing token"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(ResultCode.UNAUTHORIZED.getCode());
        assertThat(response.getBody().getMessage()).isEqualTo("missing token");
        assertThat(response.getBody().getTraceId()).isEqualTo("trace-1");
        assertThat(response.getBody().getPath()).isEqualTo("/auth/me");
    }

    @Test
    void handlesValidationExceptionWithValidationCode() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/auth/refresh");

        ResponseEntity<Result<Void>> response = handler.handleValidationException(
                new ValidationException("refreshToken must not be blank"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(ResultCode.VALIDATION_FAILED.getCode());
        assertThat(response.getBody().getMessage()).isEqualTo("refreshToken must not be blank");
        assertThat(response.getBody().getPath()).isEqualTo("/auth/refresh");
    }
}
