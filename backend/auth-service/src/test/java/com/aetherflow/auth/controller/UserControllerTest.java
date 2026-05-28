package com.aetherflow.auth.controller;

import com.aetherflow.auth.dto.AuthLogoutRequest;
import com.aetherflow.auth.dto.AuthMetricsResponse;
import com.aetherflow.auth.dto.AuthRefreshRequest;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.service.UserService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserControllerTest {

    @Test
    void registerReturnsUnifiedTokenPairResult() {
        UserService userService = mock(UserService.class);
        UserRegisterRequest request = new UserRegisterRequest();
        AuthTokenResponse response = tokenResponse();
        when(userService.register(eq(request), any(AuthRequestContext.class))).thenReturn(response);
        UserController controller = new UserController(userService);

        Result<AuthTokenResponse> result = controller.register(request, servletRequest());

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(response);
        verify(userService).register(eq(request), any(AuthRequestContext.class));
    }

    @Test
    void loginReturnsUnifiedTokenPairResult() {
        UserService userService = mock(UserService.class);
        AuthLoginRequest request = new AuthLoginRequest();
        AuthTokenResponse response = tokenResponse();
        when(userService.login(eq(request), any(AuthRequestContext.class))).thenReturn(response);
        UserController controller = new UserController(userService);

        Result<AuthTokenResponse> result = controller.login(request, servletRequest());

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(response);
    }

    @Test
    void refreshReturnsRotatedTokenPair() {
        UserService userService = mock(UserService.class);
        AuthRefreshRequest request = new AuthRefreshRequest();
        request.setRefreshToken("refresh-token");
        AuthTokenResponse response = tokenResponse();
        when(userService.refresh(eq(request), any(AuthRequestContext.class))).thenReturn(response);
        UserController controller = new UserController(userService);

        Result<AuthTokenResponse> result = controller.refresh(request, servletRequest());

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(response);
    }

    @Test
    void logoutReturnsEmptySuccessResult() {
        UserController controller = new UserController(mock(UserService.class));
        AuthLogoutRequest request = new AuthLogoutRequest();
        request.setAccessToken("access-token");
        request.setRefreshToken("refresh-token");

        Result<Void> result = controller.logout(request, servletRequest());

        assertThat(result.isSuccess()).isTrue();
    }

    @Test
    void statusAndMetricsReturnGovernanceCounters() {
        UserService userService = mock(UserService.class);
        AuthMetricsResponse response = new AuthMetricsResponse(2, 2, 5);
        when(userService.status()).thenReturn(response);
        when(userService.metrics()).thenReturn(response);
        UserController controller = new UserController(userService);

        assertThat(controller.status().getData()).isSameAs(response);
        assertThat(controller.metrics().getData()).isSameAs(response);
    }

    @Test
    void currentUserReturnsUnifiedResult() {
        UserService userService = mock(UserService.class);
        UserPrincipalDTO principal = new UserPrincipalDTO(7L, "alice", List.of("USER"));
        when(userService.currentUser(7L, "alice", "USER")).thenReturn(principal);
        UserController controller = new UserController(userService);

        Result<UserPrincipalDTO> result = controller.currentUser(7L, "alice", "USER");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(principal);
    }

    private MockHttpServletRequest servletRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("User-Agent", "JUnit");
        request.addHeader("X-Trace-Id", "trace-1");
        request.addHeader("X-Request-Id", "request-1");
        return request;
    }

    private AuthTokenResponse tokenResponse() {
        return new AuthTokenResponse(7L, "alice", List.of("USER"), "Bearer",
                "access-token", "refresh-token", 7200, 604800);
    }
}
