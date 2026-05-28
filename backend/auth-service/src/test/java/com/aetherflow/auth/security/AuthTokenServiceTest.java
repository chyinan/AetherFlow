package com.aetherflow.auth.security;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtUserClaims;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AuthTokenServiceTest {

    @Test
    void issuesAccessAndRefreshTokensWithDifferentSecretsAndLifetimes() {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecret("aetherflow-access-secret-change-me-32bytes");
        jwtProperties.setExpireMinutes(120);

        AuthProperties authProperties = new AuthProperties();
        authProperties.getToken().setRefreshSecret("aetherflow-refresh-secret-change-me-32bytes");
        authProperties.getToken().setRefreshExpireMinutes(10080);

        AuthTokenService tokenService = new AuthTokenService(jwtProperties, authProperties);

        AuthTokenBundle bundle = tokenService.issueTokenBundle(7L, "alice", List.of("USER"));

        assertThat(bundle.getAccessToken()).isNotBlank();
        assertThat(bundle.getRefreshToken()).isNotBlank();
        assertThat(bundle.getAccessToken()).isNotEqualTo(bundle.getRefreshToken());
        assertThat(bundle.getAccessExpiresInSeconds()).isEqualTo(7200);
        assertThat(bundle.getRefreshExpiresInSeconds()).isEqualTo(604800);

        JwtUserClaims accessClaims = tokenService.parseAccessToken(bundle.getAccessToken());
        JwtUserClaims refreshClaims = tokenService.parseRefreshToken(bundle.getRefreshToken());

        assertThat(accessClaims.getUserId()).isEqualTo(7L);
        assertThat(accessClaims.getUsername()).isEqualTo("alice");
        assertThat(accessClaims.getRoles()).containsExactly("USER");
        assertThat(refreshClaims.getUsername()).isEqualTo("alice");
        assertThat(tokenService.validateAccessToken(bundle.getAccessToken())).isTrue();
        assertThat(tokenService.validateAccessToken(bundle.getRefreshToken())).isFalse();
    }
}
