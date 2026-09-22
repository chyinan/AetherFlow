package com.aetherflow.workflow.ingestion.url;

// pattern: Functional Core

import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class UrlHostPolicyTest {

    @Test
    void requiresExplicitHostAllowlistWhenProductionGuardIsEnabled() throws Exception {
        InetAddress publicAddress = InetAddress.getByName("93.184.216.34");

        assertThat(UrlHostPolicy.isAllowedHost(
                "example.com", List.of(publicAddress), List.of(), true)).isFalse();
        assertThat(UrlHostPolicy.isAllowedHost(
                "example.com", List.of(publicAddress), List.of("example.com"), true)).isTrue();
    }

    @Test
    void rejectsHostOutsideAllowlistEvenWhenResolvedAddressIsPublic() throws Exception {
        InetAddress publicAddress = InetAddress.getByName("93.184.216.34");

        assertThat(UrlHostPolicy.isAllowedHost(
                "attacker.example", List.of(publicAddress), List.of("trusted.example"), true)).isFalse();
    }
}
