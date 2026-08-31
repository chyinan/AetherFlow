package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.PythonAiProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PythonAiInferenceClientFactoryTest {

    @Test
    void eachInferenceClientEnforcesItsEffectiveReadTimeout() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/slow", exchange -> {
            try {
                // This endpoint intentionally exceeds the requested deadline to verify real HTTP cancellation.
                Thread.sleep(250L);
                byte[] body = "ok".getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        try {
            PythonAiProperties properties = new PythonAiProperties();
            properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
            properties.setConnectTimeoutMillis(1_000);
            PythonAiInferenceClientFactory factory = new PythonAiInferenceClientFactory(
                    RestClient.builder(), properties);

            assertThatThrownBy(() -> factory.forTimeout(Duration.ofMillis(50))
                    .get().uri("/slow").retrieve().body(String.class))
                    .isInstanceOf(ResourceAccessException.class);
        } finally {
            server.stop(0);
        }
    }
}
