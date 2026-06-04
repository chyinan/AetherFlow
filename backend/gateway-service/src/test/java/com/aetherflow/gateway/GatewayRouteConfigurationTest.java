package com.aetherflow.gateway;

import com.aetherflow.gateway.config.GatewaySentinelProperties;
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

    @Autowired
    private GatewaySentinelProperties sentinelProperties;

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
    void taskServiceGatewayRouteDoesNotExposeInternalTaskApi() {
        RouteDefinition taskServiceRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "task-service".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(taskServiceRoute).isNotNull();
        assertThat(taskServiceRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString()).contains("Path", "/tasks/**"));
        assertThat(taskServiceRoute.getPredicates())
                .noneSatisfy(predicate -> assertThat(predicate.toString()).contains("/internal/tasks/**"));
        assertThat(matchingRoutes("/internal/tasks/dispatch")).isEmpty();
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

    @Test
    void workflowRuntimeAndNodePathsSelectWorkflowServiceRoute() {
        List.of(
                "/workflow/runtime/metrics",
                "/workflow/runtime/observability/1001",
                "/workflow/runtime/events/1001",
                "/workflow/node/catalog",
                "/workflow/node/metrics"
        ).forEach(path -> {
            Route route = firstMatchingRoute(path);

            assertThat(route).as(path).isNotNull();
            assertThat(route.getId()).as(path).isEqualTo("workflow-service");
            assertThat(route.getUri().toString()).as(path).isEqualTo("lb://workflow-service");
        });
    }

    @Test
    void workflowApiSentinelGroupIncludesSingularWorkflowPrefix() {
        GatewaySentinelProperties.ApiGroup workflowApi = sentinelProperties.getApiGroups().stream()
                .filter(apiGroup -> "workflow-api".equals(apiGroup.getName()))
                .findFirst()
                .orElse(null);

        assertThat(workflowApi).isNotNull();
        assertThat(workflowApi.getPatterns())
                .contains("/workflows", "/workflow-instances", "/workflow",
                        "/projects", "/workspaces", "/knowledge");
    }

    @Test
    void notifyWebSocketPathStillRoutesToNotifyService() {
        Route route = firstMatchingRoute("/notify/ws?streamToken=short-lived");

        assertThat(route).isNotNull();
        assertThat(route.getId()).isEqualTo("notify-service");
        assertThat(route.getUri().toString()).isEqualTo("lb://notify-service");
    }

    @Test
    void settingsPathsRouteToAuthService() {
        RouteDefinition authServiceRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "auth-service".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(authServiceRoute).isNotNull();
        assertThat(authServiceRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString())
                        .contains("Path", "/settings/**"));

        List.of(
                "/settings/profile",
                "/settings/members",
                "/settings/billing",
                "/settings/audit-events"
        ).forEach(path -> {
            Route route = firstMatchingRoute(path);

            assertThat(route).as(path).isNotNull();
            assertThat(route.getId()).as(path).isEqualTo("auth-service");
            assertThat(route.getUri().toString()).as(path).isEqualTo("lb://auth-service");
        });
    }

    @Test
    void googleOauthPathsRouteToAuthService() {
        RouteDefinition authServiceRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "auth-service".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(authServiceRoute).isNotNull();
        assertThat(authServiceRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString())
                        .contains("Path", "/oauth2/**", "/login/oauth2/**"));

        List.of(
                "/oauth2/authorization/google",
                "/login/oauth2/code/google"
        ).forEach(path -> {
            Route route = firstMatchingRoute(path);

            assertThat(route).as(path).isNotNull();
            assertThat(route.getId()).as(path).isEqualTo("auth-service");
            assertThat(route.getUri().toString()).as(path).isEqualTo("lb://auth-service");
        });
    }

    @Test
    void copilotPathsRouteToAiService() {
        RouteDefinition aiServiceRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "ai-service".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(aiServiceRoute).isNotNull();
        assertThat(aiServiceRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString())
                        .contains("Path", "/copilot/**"));

        List.of(
                "/copilot/chat",
                "/copilot/conversations",
                "/copilot/conversations/11/messages"
        ).forEach(path -> {
            Route route = firstMatchingRoute(path);

            assertThat(route).as(path).isNotNull();
            assertThat(route.getId()).as(path).isEqualTo("ai-service");
            assertThat(route.getUri().toString()).as(path).isEqualTo("lb://ai-service");
        });
    }

    private Route firstMatchingRoute(String path) {
        List<Route> matchingRoutes = matchingRoutes(path);

        assertThat(matchingRoutes).isNotNull();
        assertThat(matchingRoutes).isNotEmpty();
        return matchingRoutes.stream()
                .sorted(Comparator.comparingInt(Route::getOrder).thenComparing(Route::getId))
                .findFirst()
                .orElse(null);
    }

    private List<Route> matchingRoutes(String path) {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get(path).build()
        );

        return routeLocator.getRoutes()
                .filterWhen(route -> Mono.from(route.getPredicate().apply(exchange)))
                .collectList()
                .block(Duration.ofSeconds(2));
    }

    @Test
    void projectWorkspaceAndKnowledgePathsRouteToWorkflowService() {
        RouteDefinition workflowServiceRoute = routeDefinitionLocator.getRouteDefinitions()
                .filter(routeDefinition -> "workflow-service".equals(routeDefinition.getId()))
                .blockFirst(Duration.ofSeconds(2));

        assertThat(workflowServiceRoute).isNotNull();
        assertThat(workflowServiceRoute.getPredicates())
                .anySatisfy(predicate -> assertThat(predicate.toString())
                        .contains("Path", "/projects", "/projects/**", "/workspaces", "/workspaces/**",
                                "/knowledge/**"));

        List.of(
                "/projects",
                "/projects/7",
                "/projects/7/stats",
                "/workspaces",
                "/workspaces/5",
                "/knowledge/datasets",
                "/knowledge/datasets/11/documents",
                "/knowledge/documents/21/chunks"
        ).forEach(path -> {
            Route route = firstMatchingRoute(path);

            assertThat(route).as(path).isNotNull();
            assertThat(route.getId()).as(path).isEqualTo("workflow-service");
            assertThat(route.getUri().toString()).as(path).isEqualTo("lb://workflow-service");
        });
    }
}
