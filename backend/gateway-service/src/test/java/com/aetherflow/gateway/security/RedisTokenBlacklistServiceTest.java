package com.aetherflow.gateway.security;

import com.aetherflow.gateway.config.GatewaySecurityProperties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisTokenBlacklistServiceTest {

    @Test
    void checksBlacklistWithHashedTokenKey() {
        ReactiveStringRedisTemplate redisTemplate = mock(ReactiveStringRedisTemplate.class);
        when(redisTemplate.hasKey(anyString())).thenReturn(Mono.just(true));

        GatewaySecurityProperties properties = new GatewaySecurityProperties();
        RedisTokenBlacklistService service = new RedisTokenBlacklistService(redisTemplate, properties);

        StepVerifier.create(service.isBlacklisted("Bearer raw-token-value"))
                .expectNext(true)
                .verifyComplete();

        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(redisTemplate).hasKey(keyCaptor.capture());
        assertThat(keyCaptor.getValue()).startsWith("aetherflow:gateway:token:blacklist:");
        assertThat(keyCaptor.getValue()).doesNotContain("raw-token-value");
    }

    @Test
    void treatsRedisFailureAsBlacklistedWhenFailClosedEnabled() {
        // Default policy is fail-closed: when Redis is down we cannot prove the token
        // has NOT been revoked, so we treat it as revoked and reject the request. This
        // prevents a Redis outage from silently allowing revoked tokens through.
        ReactiveStringRedisTemplate redisTemplate = mock(ReactiveStringRedisTemplate.class);
        when(redisTemplate.hasKey(anyString())).thenReturn(Mono.error(new IllegalStateException("redis down")));

        RedisTokenBlacklistService service = new RedisTokenBlacklistService(redisTemplate, new GatewaySecurityProperties());

        StepVerifier.create(service.isBlacklisted("Bearer raw-token-value"))
                .expectNext(true)
                .verifyComplete();
    }

    @Test
    void treatsRedisFailureAsNotBlacklistedWhenFailClosedDisabled() {
        // Local development may prefer fail-open so a Redis outage does not lock every
        // authenticated user out. With blacklistFailClosed=false the old behaviour is
        // preserved: an unreachable Redis returns "not blacklisted" and the request
        // is allowed to continue to JWT validation.
        ReactiveStringRedisTemplate redisTemplate = mock(ReactiveStringRedisTemplate.class);
        when(redisTemplate.hasKey(anyString())).thenReturn(Mono.error(new IllegalStateException("redis down")));

        GatewaySecurityProperties properties = new GatewaySecurityProperties();
        properties.getToken().setBlacklistFailClosed(false);
        RedisTokenBlacklistService service = new RedisTokenBlacklistService(redisTemplate, properties);

        StepVerifier.create(service.isBlacklisted("Bearer raw-token-value"))
                .expectNext(false)
                .verifyComplete();
    }
}
