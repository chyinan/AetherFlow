package com.aetherflow.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.ai")
// pattern: Imperative Shell
public class AiInternalProperties {

    private String internalToken = "aetherflow-ai-internal-dev-token";
}
