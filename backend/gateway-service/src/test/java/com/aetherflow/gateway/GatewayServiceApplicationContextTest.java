package com.aetherflow.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
        "spring.cloud.nacos.discovery.enabled=false",
        "spring.cloud.nacos.config.enabled=false",
        "spring.cloud.sentinel.enabled=false",
        "aetherflow.gateway.sentinel.enabled=false"
})
class GatewayServiceApplicationContextTest {

    @Test
    void contextLoads() {
    }
}
