package com.aetherflow.ai.config;

// pattern: Imperative Shell
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.python-ai")
public class PythonAiProperties {

    private String baseUrl = "http://192.168.101.68:8200";
    private String apiKey = "";
    private int connectTimeoutMillis = 3000;
    private int readTimeoutMillis = 120000;
    private int statusTimeoutMillis = 3000;
}

