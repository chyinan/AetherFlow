package com.aetherflow.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.python-ai")
public class PythonAiProperties {

    private String baseUrl = "http://192.168.101.68:8200";
    private int connectTimeoutMillis = 3000;
    private int readTimeoutMillis = 120000;
}

