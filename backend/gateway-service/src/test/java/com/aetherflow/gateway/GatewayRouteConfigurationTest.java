package com.aetherflow.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.cloud.nacos.discovery.enabled=false",
        "spring.cloud.nacos.config.enabled=false",
        "spring.cloud.sentinel.enabled=false",
        "aetherflow.gateway.sentinel.enabled=false"
})
class GatewayRouteConfigurationTest {

    @Autowired
    private RouteDefinitionLocator routeDefinitionLocator;

    @Test
    void openApiAggregationRoutesRewriteGatewayPrefixesToServiceApiDocs() {
        RouteDefinition authOpenApiRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "auth-service-openapi".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(authOpenApiRoute).isNotNull();
        assertThat(authOpenApiRoute.getUri().toString()).isEqualTo("lb://auth-service");
        assertThat(authOpenApiRoute.getOrder()).isEqualTo(-100);
        assertThat(authOpenApiRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString()).contains("Path", "/auth/v3/api-docs"));
        assertThat(authOpenApiRoute.getFilters())
                .anySatisfy(filter -> assertThat(filter.toString()).contains("RewritePath", "/auth/v3/api-docs", "/v3/api-docs"));
    }
}
