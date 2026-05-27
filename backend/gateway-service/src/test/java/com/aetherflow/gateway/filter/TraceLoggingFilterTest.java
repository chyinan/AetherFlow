package com.aetherflow.gateway.filter;

import com.aetherflow.gateway.support.GatewayTrace;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class TraceLoggingFilterTest {

    @Test
    void generatesTraceIdAndPropagatesItToRequestAndResponse() {
        TraceLoggingFilter filter = new TraceLoggingFilter();
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/workflows/1").build()
        );
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();

        filter.filter(exchange, chainExchange -> {
            forwarded.set(chainExchange);
            return Mono.empty();
        }).block(Duration.ofSeconds(1));

        String traceId = forwarded.get().getAttribute(GatewayTrace.TRACE_ID_ATTRIBUTE);
        assertThat(traceId).isNotBlank();
        assertThat(forwarded.get().getRequest().getHeaders().getFirst(GatewayTrace.TRACE_ID_HEADER)).isEqualTo(traceId);
        assertThat(exchange.getResponse().getHeaders().getFirst(GatewayTrace.TRACE_ID_HEADER)).isEqualTo(traceId);
    }

    @Test
    void preservesIncomingTraceId() {
        TraceLoggingFilter filter = new TraceLoggingFilter();
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/workflows/1")
                        .header(GatewayTrace.TRACE_ID_HEADER, "trace-from-client")
                        .build()
        );
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();

        filter.filter(exchange, chainExchange -> {
            forwarded.set(chainExchange);
            return Mono.empty();
        }).block(Duration.ofSeconds(1));

        assertThat((String) forwarded.get().getAttribute(GatewayTrace.TRACE_ID_ATTRIBUTE)).isEqualTo("trace-from-client");
        assertThat(exchange.getResponse().getHeaders().getFirst(GatewayTrace.TRACE_ID_HEADER)).isEqualTo("trace-from-client");
    }
}
