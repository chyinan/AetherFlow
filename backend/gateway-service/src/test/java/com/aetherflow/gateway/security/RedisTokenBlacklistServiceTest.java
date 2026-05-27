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
    void treatsRedisFailureAsNotBlacklistedToAvoidBlockingHealthyTraffic() {
        ReactiveStringRedisTemplate redisTemplate = mock(ReactiveStringRedisTemplate.class);
        when(redisTemplate.hasKey(anyString())).thenReturn(Mono.error(new IllegalStateException("redis down")));

        RedisTokenBlacklistService service = new RedisTokenBlacklistService(redisTemplate, new GatewaySecurityProperties());

        StepVerifier.create(service.isBlacklisted("Bearer raw-token-value"))
                .expectNext(false)
                .verifyComplete();
    }
}
