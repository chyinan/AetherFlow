package com.aetherflow.ai.provider;

import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.client.RestClient;

import java.util.Locale;

@Slf4j
public abstract class PythonRuntimeAiProvider implements AiProvider {

    private final RestClient pythonAiRestClient;
    private final SentinelAiGuard sentinelAiGuard;

    protected PythonRuntimeAiProvider(RestClient pythonAiRestClient, SentinelAiGuard sentinelAiGuard) {
        this.pythonAiRestClient = pythonAiRestClient;
        this.sentinelAiGuard = sentinelAiGuard;
    }

    @Override
    public AiProviderResponse complete(AiProviderRequest request) {
        return sentinelAiGuard.execute("ai-provider-" + type().name().toLowerCase(Locale.ROOT),
                () -> doComplete(request));
    }

    private AiProviderResponse doComplete(AiProviderRequest request) {
        PythonLlmRequest pythonRequest = new PythonLlmRequest(
                type().name().toLowerCase(Locale.ROOT),
                request.model(),
                request.prompt(),
                request.options()
        );
        log.info("Calling python ai provider={}, model={}", type(), request.model());
        PythonLlmResponse response = pythonAiRestClient.post()
                .uri("/v1/llm/chat")
                .body(pythonRequest)
                .retrieve()
                .body(PythonLlmResponse.class);
        if (response == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "python ai provider returned empty response");
        }
        return new AiProviderResponse(type(), response.model(), response.text(), response.metadata());
    }
}
