package com.aetherflow.task.monitor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URLEncoder;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Slf4j
@Component
@RequiredArgsConstructor
public class RabbitMqManagementQueueMetricsClient implements QueueMetricsClient {

    private final TaskProperties properties;
    private final ObjectMapper objectMapper;

    @Override
    public QueueMetrics fetch(String queueName) {
        TaskProperties.ManagementApi managementApi = properties.getQueueProtection().getManagementApi();
        String url = managementApi.getBaseUrl()
                + "/api/queues/"
                + encode(managementApi.getVirtualHost())
                + "/"
                + encode(queueName);

        try {
            String body = RestClient.builder()
                    .requestFactory(requestFactory(managementApi))
                    .defaultHeaders(headers -> applyBasicAuth(headers, managementApi))
                    .build()
                    .get()
                    .uri(URI.create(url))
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(String.class);
            JsonNode root = objectMapper.readTree(body);
            return new QueueMetrics(
                    queueName,
                    root.path("messages_ready").asLong(0L),
                    root.path("messages_unacknowledged").asLong(0L),
                    root.path("messages").asLong(0L),
                    root.path("consumers").asInt(0));
        } catch (RestClientException exception) {
            log.error("rabbitmq management api request failed, url={}, queue={}", url, queueName, exception);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "rabbitmq queue metrics unavailable");
        } catch (Exception exception) {
            log.error("rabbitmq queue metrics parse failed, url={}, queue={}", url, queueName, exception);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "rabbitmq queue metrics invalid");
        }
    }

    private void applyBasicAuth(HttpHeaders headers, TaskProperties.ManagementApi managementApi) {
        headers.setBasicAuth(managementApi.getUsername(), managementApi.getPassword(), StandardCharsets.UTF_8);
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private JdkClientHttpRequestFactory requestFactory(TaskProperties.ManagementApi managementApi) {
        Duration timeout = managementApi.getConnectTimeout();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                java.net.http.HttpClient.newBuilder()
                        .connectTimeout(timeout)
                        .build());
        requestFactory.setReadTimeout(timeout);
        return requestFactory;
    }
}
