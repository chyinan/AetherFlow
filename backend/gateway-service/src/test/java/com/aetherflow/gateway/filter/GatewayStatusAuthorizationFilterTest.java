package com.aetherflow.gateway.filter;

import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import com.aetherflow.common.security.JwtUserClaims;
import com.aetherflow.gateway.config.GatewaySecurityProperties;
import com.aetherflow.gateway.config.GatewaySentinelProperties;
import com.aetherflow.gateway.controller.GatewayStatusController;
import com.aetherflow.gateway.support.GatewayResponseWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.List;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

class GatewayStatusAuthorizationFilterTest {

    private final JwtProperties jwtProperties = jwtProperties();
    private final JwtTokenProvider tokenProvider = new JwtTokenProvider(jwtProperties);

    @Test
    void localControllerRejectsAnonymousAndRegularUsers() {
        WebTestClient client = client(false);
        client.get().uri("/gateway/status").exchange().expectStatus().isUnauthorized();
        client.get().uri("/gateway/status")
                .header(HttpHeaders.AUTHORIZATION, bearer("USER"))
                .header("X-Roles", "ADMIN")
                .exchange().expectStatus().isForbidden();
    }

    @Test
    void localControllerReturnsOperationsSnapshotToAdministratorsAndOwners() {
        for (String role : List.of("ADMIN", "OWNER")) {
            client(false).get().uri("/gateway/status")
                    .header(HttpHeaders.AUTHORIZATION, bearer(role))
                    .exchange().expectStatus().isOk()
                    .expectBody().jsonPath("$.data.routeCount").isEqualTo(1)
                    .jsonPath("$.data.authEnabled").isEqualTo(true);
        }
    }

    @Test
    void localControllerAlsoRejectsRevokedAdministratorTokens() {
        client(true).get().uri("/gateway/status")
                .header(HttpHeaders.AUTHORIZATION, bearer("ADMIN"))
                .exchange().expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void doesNotInterceptHealthProbesOrDownstreamBusinessRoutes() {
        GatewayStatusAuthorizationFilter filter = new GatewayStatusAuthorizationFilter(null);
        for (String path : List.of("/health", "/actuator/health", "/tasks/1001", "/auth/me")) {
            AtomicBoolean forwarded = new AtomicBoolean();
            filter.filter(MockServerWebExchange.from(MockServerHttpRequest.get(path)), exchange -> {
                forwarded.set(true);
                return Mono.empty();
            }).block(Duration.ofSeconds(1));
            assertThat(forwarded.get()).as(path).isTrue();
        }
    }

    private WebTestClient client(boolean revoked) {
        GatewaySecurityProperties security = new GatewaySecurityProperties();
        JwtAuthenticationFilter authentication = new JwtAuthenticationFilter(
                tokenProvider, jwtProperties, security, token -> Mono.just(revoked),
                new GatewayResponseWriter(new ObjectMapper()));
        RouteDefinition route = new RouteDefinition();
        route.setId("synthetic-route");
        GatewayStatusController controller = new GatewayStatusController(
                () -> Flux.just(route), security, new GatewaySentinelProperties());
        // 绑定真实本地控制器，确保测试覆盖 WebFilter，而非只模拟下游路由过滤器。
        return WebTestClient.bindToController(controller)
                .webFilter(new GatewayStatusAuthorizationFilter(authentication)).build();
    }

    private String bearer(String role) {
        return "Bearer " + tokenProvider.createToken(new JwtUserClaims(7L, "synthetic-user", List.of(role)));
    }

    private static JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("aetherflow-test");
        properties.setSecret("aetherflow-test-secret-key-change-me-32bytes");
        properties.setExpireMinutes(30);
        return properties;
    }
}
