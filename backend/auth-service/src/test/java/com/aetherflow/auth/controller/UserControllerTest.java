package com.aetherflow.auth.controller;

import com.aetherflow.auth.dto.AuthLogoutRequest;
import com.aetherflow.auth.dto.AuthMetricsResponse;
import com.aetherflow.auth.dto.AuthRefreshRequest;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.service.UserService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.auth.web.RefreshTokenCookieService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.http.Cookie;

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
        UserController controller = controller(userService);
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        Result<AuthTokenResponse> result = controller.register(request, servletRequest(), servletResponse);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getRefreshToken()).isNull();
        assertSecureRefreshCookie(servletResponse);
        verify(userService).register(eq(request), any(AuthRequestContext.class));
    }

    @Test
    void loginReturnsUnifiedTokenPairResult() {
        UserService userService = mock(UserService.class);
        AuthLoginRequest request = new AuthLoginRequest();
        AuthTokenResponse response = tokenResponse();
        when(userService.login(eq(request), any(AuthRequestContext.class))).thenReturn(response);
        UserController controller = controller(userService);
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        Result<AuthTokenResponse> result = controller.login(request, servletRequest(), servletResponse);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getRefreshToken()).isNull();
        assertSecureRefreshCookie(servletResponse);
    }

    @Test
    void refreshReturnsRotatedTokenPair() {
        UserService userService = mock(UserService.class);
        AuthRefreshRequest request = new AuthRefreshRequest();
        AuthTokenResponse response = tokenResponse();
        when(userService.refresh(eq(request), any(AuthRequestContext.class))).thenReturn(response);
        UserController controller = controller(userService);
        MockHttpServletRequest servletRequest = servletRequest();
        servletRequest.setCookies(new Cookie(RefreshTokenCookieService.COOKIE_NAME, "refresh-token"));
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        Result<AuthTokenResponse> result = controller.refresh(request, servletRequest, servletResponse);

        assertThat(result.isSuccess()).isTrue();
        assertThat(request.getRefreshToken()).isEqualTo("refresh-token");
        assertThat(result.getData().getRefreshToken()).isNull();
        assertSecureRefreshCookie(servletResponse);
    }

    @Test
    void logoutReturnsEmptySuccessResult() {
        UserController controller = controller(mock(UserService.class));
        AuthLogoutRequest request = new AuthLogoutRequest();
        request.setAccessToken("access-token");
        request.setRefreshToken("refresh-token");

        MockHttpServletResponse servletResponse = new MockHttpServletResponse();
        Result<Void> result = controller.logout(request, servletRequest(), servletResponse);

        assertThat(result.isSuccess()).isTrue();
        assertThat(servletResponse.getHeader("Set-Cookie"))
                .contains("aetherflow_refresh=")
                .contains("Max-Age=0")
                .contains("HttpOnly")
                .contains("SameSite=Strict");
    }

    @Test
    void statusAndMetricsReturnGovernanceCounters() {
        UserService userService = mock(UserService.class);
        AuthMetricsResponse response = new AuthMetricsResponse(2, 2, 5);
        when(userService.status()).thenReturn(response);
        when(userService.metrics()).thenReturn(response);
        UserController controller = controller(userService);

        assertThat(controller.status().getData()).isSameAs(response);
        assertThat(controller.metrics().getData()).isSameAs(response);
    }

    @Test
    void currentUserReturnsUnifiedResult() {
        UserService userService = mock(UserService.class);
        UserPrincipalDTO principal = new UserPrincipalDTO(7L, "alice", List.of("USER"));
        when(userService.currentUser(7L, "alice", "USER")).thenReturn(principal);
        UserController controller = controller(userService);

        Result<UserPrincipalDTO> result = controller.currentUser(7L, "alice", "USER");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(principal);
    }

    private MockHttpServletRequest servletRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSecure(true);
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("User-Agent", "JUnit");
        request.addHeader("X-Trace-Id", "trace-1");
        request.addHeader("X-Request-Id", "request-1");
        return request;
    }

    private UserController controller(UserService userService) {
        return new UserController(userService, new RefreshTokenCookieService());
    }

    private void assertSecureRefreshCookie(MockHttpServletResponse response) {
        assertThat(response.getHeader("Set-Cookie"))
                .contains("aetherflow_refresh=refresh-token")
                .contains("Path=/")
                .contains("Max-Age=604800")
                .contains("Secure")
                .contains("HttpOnly")
                .contains("SameSite=Strict");
    }

    private AuthTokenResponse tokenResponse() {
        return new AuthTokenResponse(7L, "alice", List.of("USER"), "Bearer",
                "access-token", "refresh-token", 7200, 604800);
    }
}
