package com.aetherflow.notify.config;

import com.aetherflow.common.security.JwtProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class NotifySecurityConfig {
}
