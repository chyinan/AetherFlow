package com.aetherflow.gateway.filter;

import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import com.aetherflow.common.security.JwtUserClaims;
import com.aetherflow.gateway.config.GatewaySecurityProperties;
import com.aetherflow.gateway.security.TokenBlacklistService;
import com.aetherflow.gateway.support.GatewayResponseWriter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class JwtAuthenticationFilterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JwtProperties jwtProperties = jwtProperties();
    private final JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(jwtProperties);
    private final GatewaySecurityProperties securityProperties = new GatewaySecurityProperties();
    private final GatewayResponseWriter responseWriter = new GatewayResponseWriter(objectMapper);

    @Test
    void permitsWhitelistedLoginPathWithoutToken() {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(false));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/auth/login").build()
        );
        AtomicBoolean called = new AtomicBoolean(false);

        filter.filter(exchange, chain(exchange1 -> {
            called.set(true);
            return Mono.empty();
        })).block(Duration.ofSeconds(1));

        assertThat(called).isTrue();
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void permitsGoogleOauthPathsWithoutToken() {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(false));

        List.of("/oauth2/authorization/google", "/login/oauth2/code/google").forEach(path -> {
            MockServerWebExchange exchange = MockServerWebExchange.from(
                    MockServerHttpRequest.get(path).build()
            );
            AtomicBoolean called = new AtomicBoolean(false);

            filter.filter(exchange, chain(exchange1 -> {
                called.set(true);
                return Mono.empty();
            })).block(Duration.ofSeconds(1));

            assertThat(called).as(path).isTrue();
            assertThat(exchange.getResponse().getStatusCode()).as(path).isNull();
        });
    }

    @Test
    void permitsNotifyWebSocketPathWithoutBearerTokenForStreamTokenHandshake() {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(false));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/notify/ws?streamToken=short-lived").build()
        );
        AtomicBoolean called = new AtomicBoolean(false);

        filter.filter(exchange, chain(exchange1 -> {
            called.set(true);
            return Mono.empty();
        })).block(Duration.ofSeconds(1));

        assertThat(called).isTrue();
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void stillRejectsNotifySseWithoutBearerToken() throws Exception {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(false));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/notify/sse/7").build()
        );

        filter.filter(exchange, chain(exchange1 -> Mono.empty())).block(Duration.ofSeconds(1));

        JsonNode json = readBody(exchange);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(json.get("message").asText()).isEqualTo("missing bearer token");
    }

    @Test
    void rejectsMissingBearerToken() throws Exception {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(false));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/workflows/1").build()
        );

        filter.filter(exchange, chain(exchange1 -> Mono.empty())).block(Duration.ofSeconds(1));

        JsonNode json = readBody(exchange);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(json.get("code").asInt()).isEqualTo(401);
        assertThat(json.get("message").asText()).isEqualTo("missing bearer token");
    }

    @Test
    void rejectsInvalidToken() throws Exception {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(false));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/workflows/1")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer invalid")
                        .build()
        );

        filter.filter(exchange, chain(exchange1 -> Mono.empty())).block(Duration.ofSeconds(1));

        JsonNode json = readBody(exchange);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(json.get("message").asText()).isEqualTo("invalid bearer token");
    }

    @Test
    void rejectsBlacklistedTokenBeforeForwarding() throws Exception {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(true));
        String token = jwtTokenProvider.createToken(new JwtUserClaims(7L, "alice", List.of("ADMIN")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/workflows/1")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .build()
        );
        AtomicBoolean called = new AtomicBoolean(false);

        filter.filter(exchange, chain(exchange1 -> {
            called.set(true);
            return Mono.empty();
        })).block(Duration.ofSeconds(1));

        JsonNode json = readBody(exchange);
        assertThat(called).isFalse();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(json.get("message").asText()).isEqualTo("token has been revoked");
    }

    @Test
    void forwardsUserHeadersForValidTokenAndRemovesSpoofedHeaders() {
        JwtAuthenticationFilter filter = newFilter(token -> Mono.just(false));
        String token = jwtTokenProvider.createToken(new JwtUserClaims(7L, "alice", List.of("ADMIN", "USER")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/workflows/1")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .header("X-User-Id", "spoofed")
                        .header("X-Username", "mallory")
                        .build()
        );
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();

        filter.filter(exchange, chain(exchange1 -> {
            forwarded.set(exchange1);
            return Mono.empty();
        })).block(Duration.ofSeconds(1));

        assertThat(forwarded.get().getRequest().getHeaders().getFirst("X-User-Id")).isEqualTo("7");
        assertThat(forwarded.get().getRequest().getHeaders().getFirst("X-Username")).isEqualTo("alice");
        assertThat(forwarded.get().getRequest().getHeaders().getFirst("X-Roles")).isEqualTo("ADMIN,USER");
    }

    private JwtAuthenticationFilter newFilter(TokenBlacklistService tokenBlacklistService) {
        return new JwtAuthenticationFilter(
                jwtTokenProvider,
                jwtProperties,
                securityProperties,
                tokenBlacklistService,
                responseWriter
        );
    }

    private GatewayFilterChain chain(GatewayFilterChain chain) {
        return chain;
    }

    private JsonNode readBody(MockServerWebExchange exchange) throws Exception {
        String body = exchange.getResponse().getBodyAsString().block(Duration.ofSeconds(1));
        return objectMapper.readTree(body);
    }

    private JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("aetherflow-test");
        properties.setSecret("aetherflow-test-secret-key-change-me-32bytes");
        properties.setExpireMinutes(30);
        return properties;
    }
}
