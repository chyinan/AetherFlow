package com.aetherflow.gateway.security;

import reactor.core.publisher.Mono;

import java.time.Duration;

public interface TokenBlacklistService {

    Mono<Boolean> isBlacklisted(String bearerToken);

    default Mono<Boolean> blacklist(String bearerToken, Duration ttl) {
        return Mono.just(false);
    }
}
