package com.aetherflow.auth.service.impl;

import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.UserMapper;
import com.aetherflow.common.dto.AuthLoginResponse;
import com.aetherflow.common.dto.AuthLoginRequest;
import com.aetherflow.common.dto.UserPrincipalDTO;
import com.aetherflow.common.dto.UserRegisterRequest;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserMapper userMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Test
    void registerCreatesEnabledUserAndIssuesJwtToken() {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecret("aetherflow-test-secret-key-change-me-32bytes-minimum");
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(jwtProperties);
        UserServiceImpl userService = new UserServiceImpl(userMapper, passwordEncoder, jwtTokenProvider, jwtProperties);

        UserRegisterRequest request = new UserRegisterRequest();
        request.setUsername("alice");
        request.setPassword("Password123");

        when(userMapper.selectOne(any())).thenReturn(null);
        when(passwordEncoder.encode("Password123")).thenReturn("hashed-password");
        when(userMapper.insert(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(7L);
            return 1;
        });

        AuthLoginResponse response = userService.register(request);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(userCaptor.capture());
        assertThat(userCaptor.getValue().getUsername()).isEqualTo("alice");
        assertThat(userCaptor.getValue().getPasswordHash()).isEqualTo("hashed-password");
        assertThat(userCaptor.getValue().getStatus()).isEqualTo("ENABLED");
        assertThat(response.getUserId()).isEqualTo(7L);
        assertThat(response.getUsername()).isEqualTo("alice");
        assertThat(response.getRoles()).containsExactly("USER");
        assertThat(response.getTokenType()).isEqualTo("Bearer");
        assertThat(response.getAccessToken()).isNotBlank();
        assertThat(jwtTokenProvider.validateToken(response.getAccessToken())).isTrue();
    }

    @Test
    void registerRejectsDuplicateUsername() {
        UserServiceImpl userService = newUserService();
        UserRegisterRequest request = new UserRegisterRequest();
        request.setUsername("alice");
        request.setPassword("Password123");
        when(userMapper.selectOne(any())).thenReturn(existingUser(7L, "alice", "hashed-password", "ENABLED"));

        assertThatThrownBy(() -> userService.register(request))
                .isInstanceOf(BusinessException.class)
                .hasMessage("username already exists");
        verify(userMapper, never()).insert(any(User.class));
    }

    @Test
    void loginIssuesJwtWhenPasswordMatches() {
        UserServiceImpl userService = newUserService();
        AuthLoginRequest request = new AuthLoginRequest();
        request.setUsername("alice");
        request.setPassword("Password123");

        when(userMapper.selectOne(any())).thenReturn(existingUser(7L, "alice", "hashed-password", "ENABLED"));
        when(passwordEncoder.matches("Password123", "hashed-password")).thenReturn(true);

        AuthLoginResponse response = userService.login(request);

        assertThat(response.getUserId()).isEqualTo(7L);
        assertThat(response.getUsername()).isEqualTo("alice");
        assertThat(response.getRoles()).containsExactly("USER");
        assertThat(response.getAccessToken()).isNotBlank();
    }

    @Test
    void loginRejectsDisabledUser() {
        UserServiceImpl userService = newUserService();
        AuthLoginRequest request = new AuthLoginRequest();
        request.setUsername("alice");
        request.setPassword("Password123");

        when(userMapper.selectOne(any())).thenReturn(existingUser(7L, "alice", "hashed-password", "DISABLED"));
        when(passwordEncoder.matches("Password123", "hashed-password")).thenReturn(true);

        assertThatThrownBy(() -> userService.login(request))
                .isInstanceOf(BusinessException.class)
                .hasMessage("user disabled");
    }

    @Test
    void currentUserParsesGatewayRoleHeader() {
        UserServiceImpl userService = newUserService();

        UserPrincipalDTO principal = userService.currentUser(7L, "alice", "USER,ADMIN");

        assertThat(principal.getUserId()).isEqualTo(7L);
        assertThat(principal.getUsername()).isEqualTo("alice");
        assertThat(principal.getRoles()).containsExactly("USER", "ADMIN");
    }

    @Test
    void currentUserTrimsGatewayRoleHeaderValues() {
        UserServiceImpl userService = newUserService();

        UserPrincipalDTO principal = userService.currentUser(7L, "alice", "USER, ADMIN, ");

        assertThat(principal.getRoles()).containsExactly("USER", "ADMIN");
    }

    private UserServiceImpl newUserService() {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecret("aetherflow-test-secret-key-change-me-32bytes-minimum");
        return new UserServiceImpl(userMapper, passwordEncoder, new JwtTokenProvider(jwtProperties), jwtProperties);
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
