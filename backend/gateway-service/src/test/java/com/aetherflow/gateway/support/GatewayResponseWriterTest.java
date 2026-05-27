package com.aetherflow.gateway.support;

import com.aetherflow.common.core.ResultCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class GatewayResponseWriterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GatewayResponseWriter responseWriter = new GatewayResponseWriter(objectMapper);

    @Test
    void writesUnifiedResultWithTraceAndPath() throws Exception {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/workflows/1").build()
        );
        exchange.getAttributes().put(GatewayTrace.TRACE_ID_ATTRIBUTE, "trace-123");

        responseWriter.write(exchange, HttpStatus.UNAUTHORIZED, ResultCode.UNAUTHORIZED, "missing bearer token")
                .block(Duration.ofSeconds(1));

        String body = exchange.getResponse().getBodyAsString().block(Duration.ofSeconds(1));
        JsonNode json = objectMapper.readTree(body);

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(exchange.getResponse().getHeaders().getContentType().toString()).isEqualTo("application/json");
        assertThat(json.get("code").asInt()).isEqualTo(401);
        assertThat(json.get("message").asText()).isEqualTo("missing bearer token");
        assertThat(json.get("traceId").asText()).isEqualTo("trace-123");
        assertThat(json.get("path").asText()).isEqualTo("/workflows/1");
    }
}
