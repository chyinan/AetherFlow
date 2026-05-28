package com.aetherflow.auth.security;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LoginSecurityServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    private AuthProperties properties;

    @BeforeEach
    void setUp() {
        properties = new AuthProperties();
        properties.getSecurity().setLoginRateLimitPerMinute(3);
        properties.getSecurity().setPasswordMaxFailures(3);
        properties.getSecurity().setPasswordFailureWindowMinutes(15);
    }

    @Test
    void rejectsLoginWhenIpRateLimitIsExceeded() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment("auth:rate:login:127.0.0.1")).thenReturn(4L);
        LoginSecurityService service = new LoginSecurityService(redisTemplate, properties);

        assertThatThrownBy(() -> service.checkLoginRateLimit("127.0.0.1"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("too many login requests");
        verify(redisTemplate).expire("auth:rate:login:127.0.0.1", Duration.ofSeconds(60));
    }

    @Test
    void rejectsLoginWhenPasswordFailureLimitIsReached() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment("auth:login:fail:alice")).thenReturn(3L);
        LoginSecurityService service = new LoginSecurityService(redisTemplate, properties);

        assertThatThrownBy(() -> service.recordPasswordFailure("alice"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("password error limit exceeded");
        verify(redisTemplate).expire("auth:login:fail:alice", Duration.ofMinutes(15));
    }

    @Test
    void clearsPasswordFailureCounterAfterSuccessfulLogin() {
        LoginSecurityService service = new LoginSecurityService(redisTemplate, properties);

        service.clearPasswordFailures("alice");

        verify(redisTemplate).delete("auth:login:fail:alice");
    }
}
