package com.aetherflow.gateway.support;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

@Slf4j
@Component
public class GatewayResponseWriter {

    private final ObjectMapper objectMapper;

    public GatewayResponseWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper.findAndRegisterModules();
    }

    public Mono<Void> write(ServerWebExchange exchange,
                            HttpStatus httpStatus,
                            ResultCode resultCode,
                            String message) {
        if (exchange.getResponse().isCommitted()) {
            return Mono.empty();
        }
        exchange.getResponse().setStatusCode(httpStatus);
        exchange.getResponse().getHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);

        Result<Void> result = Result.<Void>fail(resultCode, message)
                .withRequestContext(GatewayTrace.resolve(exchange), exchange.getRequest().getURI().getPath());
        byte[] bytes = serialize(result, httpStatus);
        DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(bytes);
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    private byte[] serialize(Result<Void> result, HttpStatus status) {
        try {
            return objectMapper.writeValueAsBytes(result);
        } catch (JsonProcessingException exception) {
            log.error("gateway response serialize failed status={}", status.value(), exception);
            String fallback = "{\"code\":500,\"message\":\"gateway response serialize failed\"}";
            return fallback.getBytes(StandardCharsets.UTF_8);
        }
    }
}
