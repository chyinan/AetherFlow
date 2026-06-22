package com.aetherflow.auth.bootstrap;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.boot.ApplicationArguments;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DemoUserInitializerTest {

    @Mock
    private UserMapper userMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private ApplicationArguments applicationArguments;

    @Mock
    private Environment environment;

    private AuthProperties properties;

    @BeforeEach
    void setUp() {
        properties = new AuthProperties();
        when(environment.getActiveProfiles()).thenReturn(new String[]{"dev"}, new String[]{"dev"});
        when(environment.getDefaultProfiles()).thenReturn(new String[]{"default"});
    }

    @Test
    void createsEnabledDemoUserWhenMissing() throws Exception {
        properties.getDemoUser().setEnabled(true);
        properties.getDemoUser().setUsername("aether.operator");
        properties.getDemoUser().setPassword("mock-password");
        when(userMapper.selectOne(any())).thenReturn(null);
        when(passwordEncoder.encode("mock-password")).thenReturn("encoded-demo-password");

        new DemoUserInitializer(userMapper, passwordEncoder, properties, environment).run(applicationArguments);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(userCaptor.capture());
        User user = userCaptor.getValue();
        assertThat(user.getUsername()).isEqualTo("aether.operator");
        assertThat(user.getEmail()).isEqualTo("aether.operator@aetherflow.local");
        assertThat(user.getPasswordHash()).isEqualTo("encoded-demo-password");
        assertThat(user.getStatus()).isEqualTo("ENABLED");
        assertThat(user.getCreatedAt()).isNotNull();
        assertThat(user.getUpdatedAt()).isNotNull();
    }

    @Test
    void doesNotOverrideExistingDemoUser() throws Exception {
        when(userMapper.selectOne(any())).thenReturn(existingUser());

        new DemoUserInitializer(userMapper, passwordEncoder, properties, environment).run(applicationArguments);

        verify(userMapper, never()).insert(any(User.class));
        verify(passwordEncoder, never()).encode(any());
    }

    @Test
    void doesNotCreateDemoUserWhenDisabled() throws Exception {
        properties.getDemoUser().setEnabled(false);

        new DemoUserInitializer(userMapper, passwordEncoder, properties, environment).run(applicationArguments);

        verify(userMapper, never()).selectOne(any());
        verify(userMapper, never()).insert(any(User.class));
    }

    private User existingUser() {
        User user = new User();
        user.setId(1L);
        user.setUsername("aether.operator");
        user.setPasswordHash("existing-hash");
        user.setStatus("ENABLED");
        return user;
    }
}
