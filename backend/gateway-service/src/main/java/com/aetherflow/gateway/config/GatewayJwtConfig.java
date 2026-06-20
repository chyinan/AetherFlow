package com.aetherflow.gateway.config;

import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class GatewayJwtConfig {

    @Bean
    public JwtTokenProvider jwtTokenProvider(JwtProperties jwtProperties, Environment environment) {
        // The 2-arg constructor runs JwtSecretValidator with the active environment, so a blank
        // or known-weak JWT_SECRET causes the context to fail loading in non-dev profiles.
        return new JwtTokenProvider(jwtProperties, environment);
    }
}

