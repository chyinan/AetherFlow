package com.aetherflow.auth.service.impl;

import com.aetherflow.auth.audit.LoginAuditService;
import com.aetherflow.auth.audit.LoginStatus;
import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.dto.AuthLogoutRequest;
import com.aetherflow.auth.dto.AuthMetricsResponse;
import com.aetherflow.auth.dto.AuthRefreshRequest;
import com.aetherflow.auth.dto.AuthTokenResponse;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.exception.UnauthorizedException;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.auth.security.AuthTokenBundle;
import com.aetherflow.auth.security.AuthTokenService;
import com.aetherflow.auth.security.LoginSecurityService;
import com.aetherflow.auth.session.AuthMetricsSnapshot;
import com.aetherflow.auth.session.AuthSessionService;
import com.aetherflow.auth.web.AuthRequestContext;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserMapper userMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AuthSessionService authSessionService;

    @Mock
    private LoginSecurityService loginSecurityService;

    @Mock
    private LoginAuditService loginAuditService;

    private JwtProperties jwtProperties;
    private AuthTokenService authTokenService;
    private UserServiceImpl userService;

    @BeforeEach
    void setUp() {
        jwtProperties = new JwtProperties();
        jwtProperties.setSecret("aetherflow-access-secret-change-me-32bytes");
        jwtProperties.setExpireMinutes(120);

        AuthProperties authProperties = new AuthProperties();
        authProperties.getToken().setRefreshSecret("aetherflow-refresh-secret-change-me-32bytes");
        authProperties.getToken().setRefreshExpireMinutes(10080);

        authTokenService = new AuthTokenService(jwtProperties, authProperties);
        userService = new UserServiceImpl(userMapper, passwordEncoder, authTokenService,
                authSessionService, loginSecurityService, loginAuditService);
    }

    @Test
    void registerCreatesEnabledUserStoresSessionAndReturnsTokenPair() {
        UserRegisterRequest request = new UserRegisterRequest();
        request.setUsername(" alice ");
        request.setEmail("ALICE@AETHERFLOW.LOCAL ");
        request.setPassword("Password123");

        when(userMapper.selectOne(any())).thenReturn(null, null);
        when(passwordEncoder.encode("Password123")).thenReturn("hashed-password");
        when(userMapper.insert(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(7L);
            return 1;
        });

        AuthTokenResponse response = userService.register(request, requestContext());

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(userCaptor.capture());
        assertThat(userCaptor.getValue().getUsername()).isEqualTo("alice");
        assertThat(userCaptor.getValue().getEmail()).isEqualTo("alice@aetherflow.local");
        assertThat(userCaptor.getValue().getPasswordHash()).isEqualTo("hashed-password");
        assertThat(userCaptor.getValue().getStatus()).isEqualTo("ENABLED");
        assertThat(response.getUserId()).isEqualTo(7L);
        assertThat(response.getUsername()).isEqualTo("alice");
        assertThat(response.getRoles()).containsExactly("USER");
        assertThat(response.getAccessToken()).isNotBlank();
        assertThat(response.getRefreshToken()).isNotBlank();
        assertThat(response.getExpiresIn()).isEqualTo(7200);
        assertThat(response.getRefreshExpiresIn()).isEqualTo(604800);
        assertThat(new JwtTokenProvider(jwtProperties).validateToken(response.getAccessToken())).isTrue();
        assertThat(new JwtTokenProvider(jwtProperties).validateToken(response.getRefreshToken())).isFalse();
        verify(authSessionService).storeSession(eq(7L), eq(response.getAccessToken()), eq(Duration.ofMinutes(120)),
                eq(response.getRefreshToken()), eq(Duration.ofDays(7)));
    }

    @Test
    void registerRejectsDuplicateUsername() {
        UserRegisterRequest request = new UserRegisterRequest();
        request.setUsername("alice");
        request.setEmail("alice@aetherflow.local");
        request.setPassword("Password123");
        when(userMapper.selectOne(any())).thenReturn(existingUser(7L, "alice", "hashed-password", "ENABLED"));

        assertThatThrownBy(() -> userService.register(request, requestContext()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("username already exists");
        verify(userMapper, never()).insert(any(User.class));
    }

    @Test
    void registerRejectsDuplicateEmail() {
        UserRegisterRequest request = new UserRegisterRequest();
        request.setUsername("alice");
        request.setEmail("alice@aetherflow.local");
        request.setPassword("Password123");
        when(userMapper.selectOne(any()))
                .thenReturn(null)
                .thenReturn(existingUser(8L, "other", "hashed-password", "ENABLED"));

        assertThatThrownBy(() -> userService.register(request, requestContext()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("email already exists");
        verify(userMapper, never()).insert(any(User.class));
    }

    @Test
    void loginStoresSessionClearsFailuresAndRecordsAudit() {
        AuthLoginRequest request = new AuthLoginRequest();
        request.setUsername("alice");
        request.setPassword("Password123");
        when(userMapper.selectOne(any())).thenReturn(existingUser(7L, "alice", "hashed-password", "ENABLED"));
        when(passwordEncoder.matches("Password123", "hashed-password")).thenReturn(true);

        AuthTokenResponse response = userService.login(request, requestContext());

        verify(loginSecurityService).checkLoginRateLimit("127.0.0.1");
        verify(loginSecurityService).checkPasswordFailures("alice");
        verify(loginSecurityService).clearPasswordFailures("alice");
        verify(authSessionService).storeSession(eq(7L), eq(response.getAccessToken()), eq(Duration.ofMinutes(120)),
                eq(response.getRefreshToken()), eq(Duration.ofDays(7)));
        verify(loginAuditService).record(7L, "alice", "127.0.0.1", "JUnit", LoginStatus.SUCCESS);
    }

    @Test
    void loginRejectsInvalidPasswordRecordsAuditAndFailureCounter() {
        AuthLoginRequest request = new AuthLoginRequest();
        request.setUsername("alice");
        request.setPassword("wrong");
        when(userMapper.selectOne(any())).thenReturn(existingUser(7L, "alice", "hashed-password", "ENABLED"));
        when(passwordEncoder.matches("wrong", "hashed-password")).thenReturn(false);

        assertThatThrownBy(() -> userService.login(request, requestContext()))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("invalid username or password");

        verify(loginSecurityService).recordPasswordFailure("alice");
        verify(loginAuditService).record(7L, "alice", "127.0.0.1", "JUnit", LoginStatus.FAILURE);
        verify(authSessionService, never()).storeSession(any(), any(), any(), any(), any());
    }

    @Test
    void refreshRotatesTokenPairAndReplacesSession() {
        AuthTokenBundle original = authTokenService.issueTokenBundle(7L, "alice", List.of("USER"));
        AuthRefreshRequest request = new AuthRefreshRequest();
        request.setRefreshToken(original.getRefreshToken());

        when(userMapper.selectById(7L)).thenReturn(existingUser(7L, "alice", "hashed-password", "ENABLED"));
        when(authSessionService.isRefreshTokenActive(7L, original.getRefreshToken())).thenReturn(true);
        when(authSessionService.getAccessToken(7L)).thenReturn(original.getAccessToken());

        AuthTokenResponse response = userService.refresh(request, requestContext());

        assertThat(response.getAccessToken()).isNotEqualTo(original.getAccessToken());
        assertThat(response.getRefreshToken()).isNotEqualTo(original.getRefreshToken());
        verify(authSessionService).blacklistToken(eq(original.getAccessToken()), any(Duration.class));
        verify(authSessionService).storeSession(eq(7L), eq(response.getAccessToken()), eq(Duration.ofMinutes(120)),
                eq(response.getRefreshToken()), eq(Duration.ofDays(7)));
    }

    @Test
    void logoutBlacklistsAccessTokenAndDeletesSession() {
        AuthTokenBundle bundle = authTokenService.issueTokenBundle(7L, "alice", List.of("USER"));
        AuthLogoutRequest request = new AuthLogoutRequest();
        request.setAccessToken(bundle.getAccessToken());
        request.setRefreshToken(bundle.getRefreshToken());
        when(authSessionService.isRefreshTokenActive(7L, bundle.getRefreshToken())).thenReturn(true);
        when(authSessionService.getAccessToken(7L)).thenReturn(bundle.getAccessToken());

        userService.logout(request, requestContext());

        verify(authSessionService).blacklistToken(eq(bundle.getAccessToken()), any(Duration.class));
        verify(authSessionService).deleteSession(7L);
    }

    @Test
    void logoutBlacklistsStoredAccessTokenWhenRequestAccessTokenDiffers() {
        AuthTokenBundle stored = authTokenService.issueTokenBundle(7L, "alice", List.of("USER"));
        AuthTokenBundle wrong = authTokenService.issueTokenBundle(8L, "bob", List.of("USER"));
        AuthLogoutRequest request = new AuthLogoutRequest();
        request.setAccessToken(wrong.getAccessToken());
        request.setRefreshToken(stored.getRefreshToken());
        when(authSessionService.isRefreshTokenActive(7L, stored.getRefreshToken())).thenReturn(true);
        when(authSessionService.getAccessToken(7L)).thenReturn(stored.getAccessToken());

        userService.logout(request, requestContext());

        verify(authSessionService).blacklistToken(eq(stored.getAccessToken()), any(Duration.class));
        verify(authSessionService).blacklistToken(eq(wrong.getAccessToken()), any(Duration.class));
        verify(authSessionService).deleteSession(7L);
    }

    @Test
    void metricsExposeSessionSnapshot() {
        when(authSessionService.metrics()).thenReturn(new AuthMetricsSnapshot(2, 2, 5));

        AuthMetricsResponse response = userService.metrics();

        assertThat(response.getOnlineUserCount()).isEqualTo(2);
        assertThat(response.getTokenCount()).isEqualTo(2);
        assertThat(response.getLoginFailureCount()).isEqualTo(5);
    }

    @Test
    void currentUserParsesGatewayRoleHeader() {
        UserPrincipalDTO principal = userService.currentUser(7L, "alice", "USER,ADMIN");

        assertThat(principal.getUserId()).isEqualTo(7L);
        assertThat(principal.getUsername()).isEqualTo("alice");
        assertThat(principal.getRoles()).containsExactly("USER", "ADMIN");
    }

    private AuthRequestContext requestContext() {
        return new AuthRequestContext("127.0.0.1", "JUnit", "trace-1", "request-1");
    }

    private User existingUser(Long id, String username, String passwordHash, String status) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setPasswordHash(passwordHash);
        user.setStatus(status);
        return user;
    }
}
