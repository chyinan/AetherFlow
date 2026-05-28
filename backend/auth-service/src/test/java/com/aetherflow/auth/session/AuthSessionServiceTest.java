package com.aetherflow.auth.session;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthSessionServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    private AuthSessionService authSessionService;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        authSessionService = new AuthSessionService(redisTemplate);
    }

    @Test
    void storesAccessAndRefreshTokensWithRequiredKeysAndTtl() {
        authSessionService.storeSession(7L, "access-token", Duration.ofMinutes(30),
                "refresh-token", Duration.ofDays(7));

        verify(valueOperations).set("auth:token:7", "access-token", Duration.ofMinutes(30));
        verify(valueOperations).set("auth:refresh:7", "refresh-token", Duration.ofDays(7));
    }

    @Test
    void blacklistsTokenWithRequiredKeyAndTtl() {
        authSessionService.blacklistToken("access-token", Duration.ofMinutes(30));

        verify(valueOperations).set("auth:blacklist:access-token", "revoked", Duration.ofMinutes(30));
        verify(valueOperations).set(
                "aetherflow:gateway:token:blacklist:3f16bed7089f4653e5ef21bfd2824d7f3aaaecc7a598e7e89c580e1606a9cc52",
                "revoked",
                Duration.ofMinutes(30));
    }

    @Test
    void metricsCountsOnlineTokensAndLoginFailures() {
        when(redisTemplate.keys("auth:token:*")).thenReturn(Set.of("auth:token:7", "auth:token:8"));
        when(redisTemplate.keys("auth:login:fail:*")).thenReturn(Set.of("auth:login:fail:alice", "auth:login:fail:bob"));
        when(valueOperations.get("auth:login:fail:alice")).thenReturn("2");
        when(valueOperations.get("auth:login:fail:bob")).thenReturn("3");

        AuthMetricsSnapshot snapshot = authSessionService.metrics();

        assertThat(snapshot.getOnlineUserCount()).isEqualTo(2);
        assertThat(snapshot.getTokenCount()).isEqualTo(2);
        assertThat(snapshot.getLoginFailureCount()).isEqualTo(5);
    }
}
