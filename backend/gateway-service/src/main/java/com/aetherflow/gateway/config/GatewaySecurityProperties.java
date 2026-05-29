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
    }
}
