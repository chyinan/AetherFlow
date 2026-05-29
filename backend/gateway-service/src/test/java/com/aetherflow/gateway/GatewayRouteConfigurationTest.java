package com.aetherflow.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Comparator;
import java.util.List;

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

    @Autowired
    private RouteLocator routeLocator;

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

    @Test
    void fileServiceGatewayRouteDoesNotExposeInternalMetadataApi() {
        RouteDefinition fileServiceRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "file-service".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(fileServiceRoute).isNotNull();
        assertThat(fileServiceRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString()).contains("Path", "/files/**"));
        assertThat(fileServiceRoute.getPredicates())
                .noneSatisfy(predicate -> assertThat(predicate.toString()).contains("/internal/files/**"));
    }

    @Test
    void aiProviderManagementRouteIsDefinedAheadOfGenericAiRoute() {
        RouteDefinition providerRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "ai-provider-management".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(providerRoute).isNotNull();
        assertThat(providerRoute.getUri().toString()).isEqualTo("lb://ai-service");
        assertThat(providerRoute.getOrder()).isEqualTo(-50);
        assertThat(providerRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString()).contains("Path", "/ai/provider/**"));
    }

    @Test
    void aiProviderManagementPathsSelectTheSpecificAiServiceRoute() {
        List.of(
                "/ai/provider/status",
                "/ai/provider/policy",
                "/ai/provider/metrics",
                "/ai/provider/policy/recover/openai"
        ).forEach(path -> {
            Route route = firstMatchingRoute(path);

            assertThat(route).as(path).isNotNull();
            assertThat(route.getId()).as(path).isEqualTo("ai-provider-management");
            assertThat(route.getUri().toString()).as(path).isEqualTo("lb://ai-service");
            assertThat(route.getOrder()).as(path).isEqualTo(-50);
        });
    }

    private Route firstMatchingRoute(String path) {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get(path).build()
        );

        List<Route> matchingRoutes = routeLocator.getRoutes()
                .filterWhen(route -> Mono.from(route.getPredicate().apply(exchange)))
                .collectList()
                .block(Duration.ofSeconds(2));

        assertThat(matchingRoutes).isNotNull();
        assertThat(matchingRoutes).isNotEmpty();
        return matchingRoutes.stream()
                .sorted(Comparator.comparingInt(Route::getOrder).thenComparing(Route::getId))
                .findFirst()
                .orElse(null);
    }

    @Test
    void projectAndWorkspacePathsRouteToWorkflowService() {
        RouteDefinition workflowServiceRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "workflow-service".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(workflowServiceRoute).isNotNull();
        assertThat(workflowServiceRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString())
                        .contains("Path", "/projects", "/projects/**", "/workspaces", "/workspaces/**"));

        List.of(
                "/projects",
                "/projects/7",
                "/projects/7/stats",
                "/workspaces",
                "/workspaces/5"
        ).forEach(path -> {
            Route route = firstMatchingRoute(path);

            assertThat(route).as(path).isNotNull();
            assertThat(route.getId()).as(path).isEqualTo("workflow-service");
            assertThat(route.getUri().toString()).as(path).isEqualTo("lb://workflow-service");
        });
    }
}
