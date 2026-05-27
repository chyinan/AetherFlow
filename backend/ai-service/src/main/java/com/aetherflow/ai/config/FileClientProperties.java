package com.aetherflow.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.file")
public class FileClientProperties {

    private String internalToken = "aetherflow-file-internal-dev-token";
}
