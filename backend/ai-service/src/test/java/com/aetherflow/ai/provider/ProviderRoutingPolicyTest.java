package com.aetherflow.ai.provider;

// pattern: Functional Core

import com.aetherflow.ai.image.ImageProviderType;
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

    @Test
    void normalizesUnsafeRequestTimeoutBounds() {
        ProviderRoutingPolicy zero = new ProviderRoutingPolicy();
        zero.setRequestTimeout(Duration.ZERO);
        ProviderRoutingPolicy tooShort = new ProviderRoutingPolicy();
        tooShort.setRequestTimeout(Duration.ofMillis(1));
        ProviderRoutingPolicy tooLong = new ProviderRoutingPolicy();
        tooLong.setRequestTimeout(Duration.ofHours(2));

        assertThat(zero.normalized().getRequestTimeout()).isEqualTo(Duration.ofSeconds(60));
        assertThat(tooShort.normalized().getRequestTimeout()).isEqualTo(Duration.ofMillis(100));
        assertThat(tooLong.normalized().getRequestTimeout()).isEqualTo(Duration.ofMinutes(30));
    }

    @Test
    void ordersUserScopedImageProvidersAndRespectsFailoverSwitch() {
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setImageProviders(java.util.List.of(ImageProviderType.STABLE_DIFFUSION_WEBUI));

        assertThat(policy.orderedImageCandidates(ImageProviderType.COMFYUI))
                .containsExactly(ImageProviderType.COMFYUI, ImageProviderType.STABLE_DIFFUSION_WEBUI);
        policy.setEnableFailover(false);
        assertThat(policy.orderedImageCandidates(ImageProviderType.COMFYUI))
                .containsExactly(ImageProviderType.COMFYUI);
    }
}
