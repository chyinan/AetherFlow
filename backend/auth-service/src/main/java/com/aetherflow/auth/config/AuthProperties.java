package com.aetherflow.auth.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.auth")
public class AuthProperties {

    private final Token token = new Token();
    private final Security security = new Security();
    private final DemoUser demoUser = new DemoUser();

    @Data
    public static class Token {

        private long refreshExpireMinutes = 10080;
        private String refreshSecret = "aetherflow-refresh-secret-change-me-32bytes-minimum";
    }

    @Data
    public static class Security {

        private int loginRateLimitPerMinute = 20;
        private long loginRateWindowSeconds = 60;
        private int passwordMaxFailures = 5;
        private long passwordFailureWindowMinutes = 15;
    }

    @Data
    public static class DemoUser {

        private boolean enabled = true;
        private String username = "aether.operator";
        private String password = "mock-password";
    }
}
