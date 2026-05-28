package com.aetherflow.auth.session;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AuthRedisKeysTest {

    @Test
    void buildsRequiredEnterpriseAuthRedisKeys() {
        assertThat(AuthRedisKeys.tokenKey(7L)).isEqualTo("auth:token:7");
        assertThat(AuthRedisKeys.refreshKey(7L)).isEqualTo("auth:refresh:7");
        assertThat(AuthRedisKeys.blacklistKey("access-token")).isEqualTo("auth:blacklist:access-token");
        assertThat(AuthRedisKeys.gatewayBlacklistKey("Bearer access-token"))
                .isEqualTo("aetherflow:gateway:token:blacklist:3f16bed7089f4653e5ef21bfd2824d7f3aaaecc7a598e7e89c580e1606a9cc52");
    }

    @Test
    void buildsSecurityAndMetricRedisKeysUnderAuthNamespace() {
        assertThat(AuthRedisKeys.loginFailureKey("alice")).isEqualTo("auth:login:fail:alice");
        assertThat(AuthRedisKeys.loginRateKey("127.0.0.1")).isEqualTo("auth:rate:login:127.0.0.1");
    }
}
