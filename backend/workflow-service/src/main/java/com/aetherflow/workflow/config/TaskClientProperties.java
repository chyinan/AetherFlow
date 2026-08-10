package com.aetherflow.workflow.config;

import com.aetherflow.common.security.InternalServiceTokenService;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.time.Instant;

@Data
@ConfigurationProperties(prefix = "aetherflow.task")
public class TaskClientProperties {

    private String internalToken = "aetherflow-task-internal-dev-token";

    public String issueInternalToken() {
        return new InternalServiceTokenService(internalToken, "aetherflow-internal", Duration.ofMinutes(1))
                .issue("task-service", Instant.now());
    }
}
