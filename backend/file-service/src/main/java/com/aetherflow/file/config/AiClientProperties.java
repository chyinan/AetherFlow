package com.aetherflow.file.config;

// pattern: Imperative Shell

import com.aetherflow.common.security.InternalServiceTokenService;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.time.Instant;

@Data
@ConfigurationProperties(prefix = "aetherflow.ai")
public class AiClientProperties {

    private String internalToken = "aetherflow-ai-internal-dev-token";

    public String issueInternalToken() {
        return new InternalServiceTokenService(internalToken, "aetherflow-internal", Duration.ofMinutes(1))
                .issue("ai-service", Instant.now());
    }
}
