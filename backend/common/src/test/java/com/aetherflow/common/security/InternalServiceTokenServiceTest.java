package com.aetherflow.common.security;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InternalServiceTokenServiceTest {

    private static final String SECRET = "0123456789abcdef0123456789abcdef";
    private static final Instant NOW = Instant.parse("2026-07-23T08:00:00Z");

    @Test
    void acceptsTokenForExpectedAudienceBeforeExpiration() {
        InternalServiceTokenService service = service();

        String token = service.issue("file-service", NOW);

        assertThat(service.isValid(token, "file-service", NOW.plusSeconds(30))).isTrue();
    }

    @Test
    void rejectsTokenForDifferentAudience() {
        InternalServiceTokenService service = service();

        String token = service.issue("file-service", NOW);

        assertThat(service.isValid(token, "task-service", NOW.plusSeconds(1))).isFalse();
    }

    @Test
    void rejectsExpiredToken() {
        InternalServiceTokenService service = service();

        String token = service.issue("file-service", NOW);

        assertThat(service.isValid(token, "file-service", NOW.plusSeconds(61))).isFalse();
    }

    @Test
    void rejectsTamperedToken() {
        InternalServiceTokenService service = service();
        String token = service.issue("file-service", NOW);
        int signatureStart = token.lastIndexOf('.') + 1;
        char signatureCharacter = token.charAt(signatureStart);
        char replacement = signatureCharacter == 'a' ? 'b' : 'a';
        String tampered = token.substring(0, signatureStart)
                + replacement
                + token.substring(signatureStart + 1);

        assertThat(service.isValid(tampered, "file-service", NOW.plusSeconds(1))).isFalse();
    }

    @Test
    void rejectsWeakSigningSecret() {
        assertThatThrownBy(() -> new InternalServiceTokenService("too-short", "workflow-service", Duration.ofMinutes(1)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at least 32 bytes");
    }

    @Test
    void issuesUniqueTokenIds() {
        InternalServiceTokenService service = service();

        String first = service.issue("file-service", NOW);
        String second = service.issue("file-service", NOW);

        assertThat(second).isNotEqualTo(first);
    }

    private InternalServiceTokenService service() {
        return new InternalServiceTokenService(SECRET, "workflow-service", Duration.ofMinutes(1));
    }
}
