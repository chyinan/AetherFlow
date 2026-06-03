package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.dto.AuthTokenResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GoogleOAuthSuccessHandlerTest {

    private GoogleOAuthLoginService loginService;
    private AuthProperties authProperties;
    private GoogleOAuthRedirectStateService redirectStateService;
    private GoogleOAuthSuccessHandler successHandler;

    @BeforeEach
    void setUp() {
        loginService = mock(GoogleOAuthLoginService.class);
        redirectStateService = mock(GoogleOAuthRedirectStateService.class);
        authProperties = new AuthProperties();
        authProperties.getOauth().getGoogle().setFrontendBaseUrl("http://localhost:5173");
        authProperties.getOauth().getGoogle().setSuccessPath("/auth/oauth/callback");
        successHandler = new GoogleOAuthSuccessHandler(loginService, authProperties, redirectStateService);
    }

    @Test
    void redirectsToFrontendCallbackWithSystemJwtFragment() throws Exception {
        AuthTokenResponse tokenResponse = new AuthTokenResponse(
                7L,
                "alice",
                List.of("USER"),
                "Bearer",
                "access-token",
                "refresh-token",
                7200,
                604800);
        when(loginService.loginOrRegister(org.mockito.ArgumentMatchers.any(GoogleOAuthUser.class)))
                .thenReturn(new GoogleOAuthLoginResult(tokenResponse));
        when(redirectStateService.consumeRedirectPath("state-1")).thenReturn("/projects");

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/login/oauth2/code/google");
        request.setParameter("state", "state-1");
        MockHttpServletResponse response = new MockHttpServletResponse();

        successHandler.onAuthenticationSuccess(request, response, googleAuthentication());

        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_FOUND);
        assertThat(response.getRedirectedUrl())
                .startsWith("http://localhost:5173/auth/oauth/callback#")
                .contains("accessToken=access-token")
                .contains("refreshToken=refresh-token")
                .contains("tokenType=Bearer")
                .contains("expiresIn=7200")
                .contains("refreshExpiresIn=604800")
                .contains("userId=7")
                .contains("username=alice")
                .contains("roles=USER")
                .contains("redirect=%2Fprojects");

        ArgumentCaptor<GoogleOAuthUser> userCaptor = ArgumentCaptor.forClass(GoogleOAuthUser.class);
        verify(loginService).loginOrRegister(userCaptor.capture());
        assertThat(userCaptor.getValue().id()).isEqualTo("google-42");
        assertThat(userCaptor.getValue().email()).isEqualTo("alice@example.com");
        assertThat(userCaptor.getValue().emailVerified()).isTrue();
        assertThat(userCaptor.getValue().name()).isEqualTo("Alice Example");
        assertThat(userCaptor.getValue().avatarUrl()).isEqualTo("https://lh3.googleusercontent.com/a/alice");
    }

    private OAuth2AuthenticationToken googleAuthentication() {
        DefaultOAuth2User principal = new DefaultOAuth2User(
                List.of(new SimpleGrantedAuthority("OIDC_USER")),
                Map.of(
                        "sub", "google-42",
                        "email", "alice@example.com",
                        "email_verified", true,
                        "name", "Alice Example",
                        "picture", "https://lh3.googleusercontent.com/a/alice"
                ),
                "sub");
        return new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "google");
    }
}
