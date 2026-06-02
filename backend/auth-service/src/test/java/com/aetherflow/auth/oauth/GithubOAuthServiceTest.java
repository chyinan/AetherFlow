package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.entity.OAuthAccount;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.OAuthAccountMapper;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.auth.security.AuthTokenService;
import com.aetherflow.auth.session.AuthSessionService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.common.security.JwtProperties;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GithubOAuthServiceTest {

    @Mock
    private GithubOAuthClient githubOAuthClient;

    @Mock
    private OAuthAccountMapper oauthAccountMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AuthSessionService authSessionService;

    private GithubOAuthStateService stateService;
    private GithubOAuthService githubOAuthService;

    @BeforeEach
    void setUp() {
        AuthProperties authProperties = authProperties();
        stateService = new GithubOAuthStateService(authProperties, new ObjectMapper());
        AuthTokenService authTokenService = new AuthTokenService(jwtProperties(), authProperties);
        githubOAuthService = new GithubOAuthService(
                authProperties,
                githubOAuthClient,
                stateService,
                oauthAccountMapper,
                userMapper,
                passwordEncoder,
                authTokenService,
                authSessionService
        );
    }

    @Test
    void createsGithubAuthorizeUrlWithSignedState() {
        String authorizeUrl = githubOAuthService.createAuthorizationUrl(
                "/projects",
                "http://localhost/api/auth/oauth/github/callback");

        assertThat(authorizeUrl)
                .startsWith("https://github.com/login/oauth/authorize?")
                .contains("client_id=github-client")
                .contains("redirect_uri=http%3A%2F%2Flocalhost%2Fapi%2Fauth%2Foauth%2Fgithub%2Fcallback")
                .contains("scope=read%3Auser+user%3Aemail")
                .contains("state=");
    }

    @Test
    void callbackCreatesLocalUserBindsGithubAccountAndIssuesTokenPair() {
        String state = stateService.createState("/projects", "http://localhost/api/auth/oauth/github/callback");
        GithubOAuthUser githubUser = new GithubOAuthUser(
                "42",
                "octocat",
                "The Octocat",
                "octocat@example.com",
                "https://avatars.githubusercontent.com/u/42");

        when(githubOAuthClient.exchangeCode("code-1", "http://localhost/api/auth/oauth/github/callback"))
                .thenReturn("github-access-token");
        when(githubOAuthClient.fetchUser("github-access-token")).thenReturn(githubUser);
        when(oauthAccountMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(passwordEncoder.encode(any())).thenReturn("disabled-password");
        when(userMapper.insert(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(11L);
            return 1;
        });

        GithubOAuthLoginResult result = githubOAuthService.completeLogin("code-1", state, requestContext());

        assertThat(result.redirectPath()).isEqualTo("/projects");
        assertThat(result.tokenResponse().getUserId()).isEqualTo(11L);
        assertThat(result.tokenResponse().getUsername()).isEqualTo("octocat");
        assertThat(result.tokenResponse().getAccessToken()).isNotBlank();
        assertThat(result.tokenResponse().getRefreshToken()).isNotBlank();
        verify(authSessionService).storeSession(eq(11L), eq(result.tokenResponse().getAccessToken()),
                eq(Duration.ofMinutes(120)), eq(result.tokenResponse().getRefreshToken()), eq(Duration.ofDays(7)));

        ArgumentCaptor<OAuthAccount> accountCaptor = ArgumentCaptor.forClass(OAuthAccount.class);
        verify(oauthAccountMapper).insert(accountCaptor.capture());
        assertThat(accountCaptor.getValue().getProvider()).isEqualTo("GITHUB");
        assertThat(accountCaptor.getValue().getProviderUserId()).isEqualTo("42");
        assertThat(accountCaptor.getValue().getUserId()).isEqualTo(11L);
        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(userCaptor.capture());
        assertThat(userCaptor.getValue().getEmail()).isEqualTo("octocat@example.com");
    }

    private AuthProperties authProperties() {
        AuthProperties properties = new AuthProperties();
        properties.getOauth().getGithub().setClientId("github-client");
        properties.getOauth().getGithub().setClientSecret("github-secret");
        properties.getOauth().getGithub().setStateSecret("aetherflow-github-oauth-state-secret-32bytes");
        return properties;
    }

    private JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("aetherflow-access-secret-change-me-32bytes");
        properties.setExpireMinutes(120);
        return properties;
    }

    private AuthRequestContext requestContext() {
        return new AuthRequestContext("127.0.0.1", "JUnit", "trace-1", "request-1");
    }
}
