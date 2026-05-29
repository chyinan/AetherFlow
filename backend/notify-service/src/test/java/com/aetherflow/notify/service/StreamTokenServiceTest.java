package com.aetherflow.notify.service;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.notify.dto.StreamTokenResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StreamTokenServiceTest {

    @Test
    void issuesAndValidatesShortLivedNotifyStreamToken() {
        StreamTokenService service = new StreamTokenService(jwtProperties());

        StreamTokenResponse response = service.issue(7L, "alice");
        StreamTokenService.StreamTokenClaims claims = service.validate(response.token());

        assertThat(response.tokenType()).isEqualTo("stream");
        assertThat(response.expiresInSeconds()).isEqualTo(60);
        assertThat(response.transports()).containsExactly("notify-websocket");
        assertThat(claims.userId()).isEqualTo(7L);
        assertThat(claims.username()).isEqualTo("alice");
    }

    @Test
    void rejectsInvalidStreamToken() {
        StreamTokenService service = new StreamTokenService(jwtProperties());

        assertThatThrownBy(() -> service.validate("not-a-token"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid stream token");
    }

    private JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("aetherflow-test");
        properties.setSecret("aetherflow-test-secret-key-change-me-32bytes");
        properties.setExpireMinutes(30);
        return properties;
    }
}
