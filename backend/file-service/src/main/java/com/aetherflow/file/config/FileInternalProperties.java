package com.aetherflow.file.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.file")
public class FileInternalProperties {

    private String internalToken = "aetherflow-file-internal-dev-token";
}
