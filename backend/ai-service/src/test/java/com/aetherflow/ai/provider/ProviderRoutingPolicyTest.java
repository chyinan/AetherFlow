package com.aetherflow.ai.provider;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class ProviderRoutingPolicyTest {

    @Test
    void normalizesMissingRequestTimeoutForLegacyRedisPolicyValues() {
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setRequestTimeout(null);

        ProviderRoutingPolicy normalized = policy.normalized();

        assertThat(normalized.getRequestTimeout()).isEqualTo(Duration.ofSeconds(60));
    }

    @Test
    void copyPreservesRequestTimeout() {
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setRequestTimeout(Duration.ofSeconds(15));

        ProviderRoutingPolicy copy = policy.copy();

        assertThat(copy.getRequestTimeout()).isEqualTo(Duration.ofSeconds(15));
    }
}
