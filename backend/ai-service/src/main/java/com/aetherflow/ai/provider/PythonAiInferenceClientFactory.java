package com.aetherflow.ai.provider;

// pattern: Imperative Shell

import com.aetherflow.ai.config.PythonAiProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

@Component
public class PythonAiInferenceClientFactory {

    private final RestClient.Builder baseBuilder;
    private final HttpClient sharedHttpClient;

    public PythonAiInferenceClientFactory(RestClient.Builder restClientBuilder,
                                          PythonAiProperties properties) {
        Duration connectTimeout = Duration.ofMillis(Math.max(100, properties.getConnectTimeoutMillis()));
        this.sharedHttpClient = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .build();
        this.baseBuilder = restClientBuilder.clone().baseUrl(properties.getBaseUrl());
    }

    public RestClient forTimeout(Duration timeout) {
        if (timeout == null || timeout.isZero() || timeout.isNegative()) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "AI inference timeout must be positive");
        }
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(sharedHttpClient);
        requestFactory.setReadTimeout(timeout);
        return baseBuilder.clone()
                .requestFactory(requestFactory)
                .build();
    }
}
