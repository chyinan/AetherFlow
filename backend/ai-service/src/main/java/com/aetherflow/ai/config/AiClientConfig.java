package com.aetherflow.ai.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
@EnableConfigurationProperties({PythonAiProperties.class, AiTaskProperties.class, FileClientProperties.class, TaskClientProperties.class})
public class AiClientConfig {

    /**
     * RestClient for the Python AI service. Uses {@link JdkClientHttpRequestFactory} backed
     * by a shared {@link HttpClient} with connection pooling, replacing the previous
     * {@code SimpleClientHttpRequestFactory} which opened a new TCP connection per request.
     */
    @Bean
    public RestClient pythonAiRestClient(PythonAiProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofMillis(properties.getConnectTimeoutMillis()))
                        .build());
        requestFactory.setReadTimeout(Duration.ofMillis(properties.getReadTimeoutMillis()));
        return RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    @Bean
    public RestClient aiCallbackRestClient(AiTaskProperties properties) {
        Duration timeout = properties.getCallbackTimeout();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                        .connectTimeout(timeout)
                        .build());
        requestFactory.setReadTimeout(timeout);
        return RestClient.builder()
                .requestFactory(requestFactory)
                .build();
    }
}

