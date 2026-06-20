package com.aetherflow.auth.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.auth")
public class AuthProperties {

    private final Token token = new Token();
    private final Security security = new Security();
    private final DemoUser demoUser = new DemoUser();
    private final OAuth oauth = new OAuth();

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

        // Disabled by default; only the `dev` profile (application-dev.yml) re-enables it.
        // Auto-seeding a demo account in non-dev environments is a credential backdoor.
        private boolean enabled = false;
        private String username = "aether.operator";
        private String email = "aether.operator@aetherflow.local";
        private String password = "mock-password";
    }

    @Data
    public static class OAuth {

        private final Github github = new Github();
        private final Google google = new Google();

        @Data
        public static class Github {

            private String clientId = "";
            private String clientSecret = "";
            private String authorizeUri = "https://github.com/login/oauth/authorize";
            private String tokenUri = "https://github.com/login/oauth/access_token";
            private String userUri = "https://api.github.com/user";
            private String emailsUri = "https://api.github.com/user/emails";
            private String redirectUri = "";
            private String frontendBaseUrl = "";
            private String successPath = "/auth/oauth/callback";
            private String failurePath = "/login";
            private String stateSecret = "aetherflow-github-oauth-state-secret-32bytes";
            private long stateTtlMinutes = 10;
        }

        @Data
        public static class Google {

            private String clientId = "";
            private String clientSecret = "";
            private String redirectUri = "{baseUrl}/login/oauth2/code/{registrationId}";
            private String frontendBaseUrl = "";
            private String successPath = "/auth/oauth/callback";
            private String failurePath = "/login";
            private String defaultRedirectPath = "/projects";
            private long stateTtlMinutes = 10;
        }
    }
}
