package com.aetherflow.ai.config;

// pattern: Imperative Shell
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
@EnableConfigurationProperties({PythonAiProperties.class, AiTaskProperties.class, FileClientProperties.class, TaskClientProperties.class, AiInternalProperties.class})
public class AiClientConfig {

    /**
     * RestClient for the Python AI service. Uses {@link JdkClientHttpRequestFactory} backed
     * by a shared {@link HttpClient} with connection pooling, replacing the previous
     * {@code SimpleClientHttpRequestFactory} which opened a new TCP connection per request.
     */
    @Bean
    public RestClient pythonAiRestClient(RestClient.Builder restClientBuilder, PythonAiProperties properties) {
        JdkClientHttpRequestFactory requestFactory = requestFactory(
                properties.getConnectTimeoutMillis(), properties.getReadTimeoutMillis());
        RestClient.Builder builder = restClientBuilder.clone()
                .baseUrl(properties.getBaseUrl())
                .requestFactory(requestFactory);
        if (properties.getApiKey() != null && !properties.getApiKey().isBlank()) {
            builder.defaultHeader("X-API-Key", properties.getApiKey());
        }
        return builder.build();
    }

    @Bean
    public RestClient pythonAiStatusRestClient(RestClient.Builder restClientBuilder, PythonAiProperties properties) {
        int timeoutMillis = Math.max(100, properties.getStatusTimeoutMillis());
        RestClient.Builder builder = restClientBuilder.clone()
                .baseUrl(properties.getBaseUrl())
                .requestFactory(requestFactory(Math.min(properties.getConnectTimeoutMillis(), timeoutMillis), timeoutMillis));
        if (properties.getApiKey() != null && !properties.getApiKey().isBlank()) {
            builder.defaultHeader("X-API-Key", properties.getApiKey());
        }
        return builder.build();
    }

    @Bean
    public RestClient aiCallbackRestClient(RestClient.Builder restClientBuilder, AiTaskProperties properties) {
        Duration timeout = properties.getCallbackTimeout();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                        .connectTimeout(timeout)
                        .build());
        requestFactory.setReadTimeout(timeout);
        return restClientBuilder.clone()
                .requestFactory(requestFactory)
                .build();
    }

    private JdkClientHttpRequestFactory requestFactory(int connectTimeoutMillis, int readTimeoutMillis) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofMillis(Math.max(100, connectTimeoutMillis)))
                        .build());
        requestFactory.setReadTimeout(Duration.ofMillis(Math.max(100, readTimeoutMillis)));
        return requestFactory;
    }
}

