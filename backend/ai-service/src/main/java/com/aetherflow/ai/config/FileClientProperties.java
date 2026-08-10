package com.aetherflow.ai.config;

import com.aetherflow.common.security.InternalServiceTokenService;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.time.Instant;

@Data
@ConfigurationProperties(prefix = "aetherflow.file")
public class FileClientProperties {

    private String internalToken = "aetherflow-file-internal-dev-token";

    public String issueInternalToken() {
        return new InternalServiceTokenService(internalToken, "aetherflow-internal", Duration.ofMinutes(1))
                .issue("file-service", Instant.now());
    }
}
