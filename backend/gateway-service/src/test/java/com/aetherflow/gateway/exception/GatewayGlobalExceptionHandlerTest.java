package com.aetherflow.gateway.exception;

import com.aetherflow.gateway.support.GatewayResponseWriter;
import com.alibaba.csp.sentinel.slots.block.flow.FlowException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import java.time.Duration;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;

class GatewayGlobalExceptionHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GatewayGlobalExceptionHandler exceptionHandler =
            new GatewayGlobalExceptionHandler(new GatewayResponseWriter(objectMapper));

    @Test
    void convertsTimeoutToUnifiedServiceUnavailableResult() throws Exception {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/ai/transcriptions/1").build()
        );

        exceptionHandler.handle(exchange, new TimeoutException("upstream timeout"))
                .block(Duration.ofSeconds(1));

        String body = exchange.getResponse().getBodyAsString().block(Duration.ofSeconds(1));
        JsonNode json = objectMapper.readTree(body);

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(json.get("code").asInt()).isEqualTo(503);
        assertThat(json.get("message").asText()).isEqualTo("service unavailable");
        assertThat(json.get("path").asText()).isEqualTo("/ai/transcriptions/1");
    }

    @Test
    void convertsSentinelBlockExceptionToTooManyRequestsResult() throws Exception {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/ai/provider/catalog").build()
        );

        exceptionHandler.handle(exchange, new FlowException("ai-provider-api"))
                .block(Duration.ofSeconds(1));

        String body = exchange.getResponse().getBodyAsString().block(Duration.ofSeconds(1));
        JsonNode json = objectMapper.readTree(body);

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(json.get("code").asInt()).isEqualTo(429);
        assertThat(json.get("message").asText()).isEqualTo("too many requests");
        assertThat(json.get("path").asText()).isEqualTo("/ai/provider/catalog");
    }
}
