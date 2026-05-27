package com.aetherflow.common.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "aetherflow.security.jwt")
public class JwtProperties {

    private String issuer = "aetherflow";
    private String secret = "aetherflow-dev-secret-key-change-me-32bytes-minimum";
    private long expireMinutes = 120;
    private String header = "Authorization";
    private String prefix = "Bearer ";
}

