package com.aetherflow.gateway.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties(prefix = "aetherflow.gateway.security")
public class GatewaySecurityProperties {

    /**
     * Switch kept for local emergency rollback without removing the filter bean.
     */
    private boolean authEnabled = true;

    private List<String> permitAll = new ArrayList<>(List.of(
            "/auth/**",
            "/oauth2/**",
            "/login/oauth2/**",
            "/actuator/**",
            "/health",
            "/gateway/status",
            "/notify/ws",
            "/swagger-ui/**",
            "/webjars/**",
            "/v3/api-docs/**"
    ));

    private Token token = new Token();

    @Data
    public static class Token {
        private boolean blacklistEnabled = true;
        private String blacklistKeyPrefix = "aetherflow:gateway:token:blacklist:";

        /**
         * When {@code true} (default), a Redis failure while checking the token
         * blacklist causes the request to be rejected with 401 instead of being
         * silently allowed through. Set {@code false} only for local development
         * where a Redis outage should not lock out every authenticated request.
         */
        private boolean blacklistFailClosed = true;
    }
}
