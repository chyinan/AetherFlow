package com.aetherflow.auth.oauth;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.entity.OAuthAccount;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.OAuthAccountMapper;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.auth.security.AuthTokenService;
import com.aetherflow.auth.session.AuthSessionService;
import com.aetherflow.common.security.JwtProperties;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GoogleOAuthLoginServiceTest {

    @Mock
    private OAuthAccountMapper oauthAccountMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AuthSessionService authSessionService;

    private GoogleOAuthLoginService googleOAuthLoginService;

    @BeforeEach
    void setUp() {
        AuthProperties authProperties = new AuthProperties();
        authProperties.getToken().setRefreshSecret("aetherflow-refresh-secret-change-me-32bytes");
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecret("aetherflow-access-secret-change-me-32bytes");
        jwtProperties.setExpireMinutes(120);
        googleOAuthLoginService = new GoogleOAuthLoginService(
                oauthAccountMapper,
                userMapper,
                passwordEncoder,
                new AuthTokenService(jwtProperties, authProperties),
                authSessionService
        );
    }

    @Test
    void createsLocalUserBindsGoogleAccountAndIssuesTokenPairForFirstLogin() {
        GoogleOAuthUser googleUser = new GoogleOAuthUser(
                "google-42",
                "alice@example.com",
                true,
                "Alice Example",
                "https://lh3.googleusercontent.com/a/alice");

        when(oauthAccountMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null, null);
        when(passwordEncoder.encode(any())).thenReturn("disabled-password");
        when(userMapper.insert(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(11L);
            return 1;
        });

        GoogleOAuthLoginResult result = googleOAuthLoginService.loginOrRegister(googleUser);

        assertThat(result.tokenResponse().getUserId()).isEqualTo(11L);
        assertThat(result.tokenResponse().getUsername()).isEqualTo("alice");
        assertThat(result.tokenResponse().getRoles()).containsExactly("USER");
        assertThat(result.tokenResponse().getAccessToken()).isNotBlank();
        assertThat(result.tokenResponse().getRefreshToken()).isNotBlank();
        verify(authSessionService).storeSession(eq(11L), eq(result.tokenResponse().getAccessToken()),
                eq(Duration.ofMinutes(120)), eq(result.tokenResponse().getRefreshToken()), eq(Duration.ofDays(7)));

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(userCaptor.capture());
        assertThat(userCaptor.getValue().getEmail()).isEqualTo("alice@example.com");
        assertThat(userCaptor.getValue().getStatus()).isEqualTo("ENABLED");

        ArgumentCaptor<OAuthAccount> accountCaptor = ArgumentCaptor.forClass(OAuthAccount.class);
        verify(oauthAccountMapper).insert(accountCaptor.capture());
        assertThat(accountCaptor.getValue().getProvider()).isEqualTo("GOOGLE");
        assertThat(accountCaptor.getValue().getProviderUserId()).isEqualTo("google-42");
        assertThat(accountCaptor.getValue().getProviderEmail()).isEqualTo("alice@example.com");
        assertThat(accountCaptor.getValue().getAvatarUrl()).isEqualTo("https://lh3.googleusercontent.com/a/alice");
    }

    @Test
    void bindsGoogleAccountToExistingEnabledUserWithSameVerifiedEmail() {
        GoogleOAuthUser googleUser = new GoogleOAuthUser(
                "google-42",
                "alice@example.com",
                true,
                "Alice Example",
                "https://lh3.googleusercontent.com/a/alice");
        User existingUser = user(7L, "alice", "alice@example.com", "ENABLED");

        when(oauthAccountMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existingUser);

        GoogleOAuthLoginResult result = googleOAuthLoginService.loginOrRegister(googleUser);

        assertThat(result.tokenResponse().getUserId()).isEqualTo(7L);
        assertThat(result.tokenResponse().getUsername()).isEqualTo("alice");
        verify(userMapper, never()).insert(any(User.class));
        ArgumentCaptor<OAuthAccount> accountCaptor = ArgumentCaptor.forClass(OAuthAccount.class);
        verify(oauthAccountMapper).insert(accountCaptor.capture());
        assertThat(accountCaptor.getValue().getUserId()).isEqualTo(7L);
        assertThat(accountCaptor.getValue().getProvider()).isEqualTo("GOOGLE");
    }

    @Test
    void logsInExistingBoundGoogleAccountWithoutCreatingDuplicateUser() {
        GoogleOAuthUser googleUser = new GoogleOAuthUser(
                "google-42",
                "alice@example.com",
                true,
                "Alice Example",
                "https://lh3.googleusercontent.com/a/alice");
        OAuthAccount account = new OAuthAccount();
        account.setUserId(7L);
        account.setProvider("GOOGLE");
        account.setProviderUserId("google-42");

        when(oauthAccountMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(account);
        when(userMapper.selectById(7L)).thenReturn(user(7L, "alice", "alice@example.com", "ENABLED"));

        GoogleOAuthLoginResult result = googleOAuthLoginService.loginOrRegister(googleUser);

        assertThat(result.tokenResponse().getUserId()).isEqualTo(7L);
        verify(userMapper, never()).insert(any(User.class));
        verify(oauthAccountMapper, never()).insert(any(OAuthAccount.class));
    }

    @Test
    void rejectsUnverifiedGoogleEmailForAutomaticBinding() {
        GoogleOAuthUser googleUser = new GoogleOAuthUser(
                "google-42",
                "alice@example.com",
                false,
                "Alice Example",
                "https://lh3.googleusercontent.com/a/alice");

        assertThatThrownBy(() -> googleOAuthLoginService.loginOrRegister(googleUser))
                .hasMessage("google email is not verified");
    }

    private User user(Long id, String username, String email, String status) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setEmail(email);
        user.setStatus(status);
        user.setPasswordHash("hashed-password");
        return user;
    }
}
