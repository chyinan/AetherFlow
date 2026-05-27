package com.aetherflow.common.security;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JwtTokenProviderTest {

    @Test
    void tokenProviderCreatesAndParsesUserClaims() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("aetherflow-test-secret-key-change-me-32bytes-minimum");
        JwtTokenProvider provider = new JwtTokenProvider(properties);

        String token = provider.createToken(new JwtUserClaims(7L, "alice", List.of("USER", "ADMIN")));
        JwtUserClaims claims = provider.parseToken(properties.getPrefix() + token);

        assertThat(provider.validateToken(token)).isTrue();
        assertThat(claims.getUserId()).isEqualTo(7L);
        assertThat(claims.getUsername()).isEqualTo("alice");
        assertThat(claims.getRoles()).containsExactly("USER", "ADMIN");
    }
}
