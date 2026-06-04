package com.aetherflow.task.monitor;

import com.aetherflow.task.config.TaskProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class RabbitMqManagementQueueMetricsClientTest {

    @Test
    void fetchKeepsDefaultVhostEncodedOnce() throws Exception {
        AtomicReference<String> rawPath = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            rawPath.set(exchange.getRequestURI().getRawPath());
            byte[] body = """
                    {"messages_ready":2,"messages_unacknowledged":1,"messages":3,"consumers":1}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            TaskProperties properties = new TaskProperties();
            TaskProperties.ManagementApi managementApi = properties.getQueueProtection().getManagementApi();
            managementApi.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
            managementApi.setVirtualHost("/");
            RabbitMqManagementQueueMetricsClient client = new RabbitMqManagementQueueMetricsClient(properties, new ObjectMapper());

            QueueMetrics metrics = client.fetch("aetherflow.task.scheduler.queue");

            assertThat(metrics.getTotalMessages()).isEqualTo(3);
            assertThat(rawPath.get()).isEqualTo("/api/queues/%2F/aetherflow.task.scheduler.queue");
        } finally {
            server.stop(0);
        }
    }
}
