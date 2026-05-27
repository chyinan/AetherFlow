package com.aetherflow.gateway.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
        GatewaySecurityProperties.class,
        GatewaySentinelProperties.class
})
public class GatewayPropertiesConfig {
}
