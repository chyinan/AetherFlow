package com.aetherflow.ai.provider;

import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;

@Slf4j
public abstract class PythonRuntimeAiProvider implements AiProvider {

    private final RestClient pythonAiRestClient;
    private final SentinelAiGuard sentinelAiGuard;
    private final ObjectMapper objectMapper;

    protected PythonRuntimeAiProvider(RestClient pythonAiRestClient,
                                      SentinelAiGuard sentinelAiGuard,
                                      ObjectMapper objectMapper) {
        this.pythonAiRestClient = pythonAiRestClient;
        this.sentinelAiGuard = sentinelAiGuard;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiProviderResponse complete(AiProviderRequest request) {
        return generate(request);
    }

    @Override
    public AiProviderResponse generate(AiProviderRequest request) {
        return sentinelAiGuard.execute("ai-provider-" + type().name().toLowerCase(Locale.ROOT),
                () -> doGenerate(request));
    }

    @Override
    public AiProviderHealth health() {
        return sentinelAiGuard.execute("ai-provider-health-" + type().name().toLowerCase(Locale.ROOT), () -> {
            long startedAt = System.currentTimeMillis();
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> status = pythonAiRestClient.get()
                        .uri("/ai/status")
                        .retrieve()
                        .body(Map.class);
                long latency = System.currentTimeMillis() - startedAt;
                if (status == null) {
                    return AiProviderHealth.down(type(), "python ai status response is empty", Map.of());
                }
                boolean llmEnabled = Boolean.TRUE.equals(status.get("llmEnabled"));
                boolean providerEnabled = providerListed(status.get("providers"));
                if (!llmEnabled) {
                    return AiProviderHealth.degraded(type(), latency, "python ai llm fallback enabled", status);
                }
                if (providerEnabled) {
                    return AiProviderHealth.up(type(), latency, "python ai provider healthy", status);
                }
                return AiProviderHealth.degraded(type(), latency, "python ai runtime reachable but provider metadata incomplete", status);
            } catch (RuntimeException exception) {
                log.warn("Provider health check failed provider={}", type(), exception);
                return AiProviderHealth.down(type(), exception.getMessage(), Map.of("checkedAt", Instant.now().toString()));
            }
        });
    }

    @Override
    public void stream(AiProviderRequest request, Consumer<AiProviderResponse> consumer) {
        sentinelAiGuard.run("ai-provider-" + type().name().toLowerCase(Locale.ROOT), () ->
                pythonAiRestClient.post()
                        .uri("/v1/llm/chat/stream")
                        .body(new PythonLlmRequest(
                                type().name().toLowerCase(Locale.ROOT),
                                request.model(),
                                request.prompt(),
                                request.options()))
                        .exchange((clientRequest, clientResponse) -> {
                            if (clientResponse.getStatusCode().isError()) {
                                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                                        "python ai stream returned " + clientResponse.getStatusCode().value());
                            }
                            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                                    clientResponse.getBody(), StandardCharsets.UTF_8))) {
                                String line;
                                while ((line = reader.readLine()) != null) {
                                    if (!line.startsWith("data: ")) {
                                        continue;
                                    }
                                    String payload = line.substring("data: ".length()).trim();
                                    if ("[DONE]".equals(payload)) {
                                        break;
                                    }
                                    JsonNode data = objectMapper.readTree(payload);
                                    String text = data.path("text").asText("");
                                    if (!text.isBlank()) {
                                        consumer.accept(new AiProviderResponse(
                                                type(),
                                                data.path("model").asText(request.model()),
                                                text,
                                                objectMapper.convertValue(data.path("metadata"), new TypeReference<Map<String, Object>>() {
                                                })));
                                    }
                                }
                            } catch (IOException | RuntimeException exception) {
                                if (exception instanceof BusinessException businessException) {
                                    throw businessException;
                                }
                                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                                        "python ai stream failed: " + exception.getMessage());
                            }
                            return null;
                        }));
    }

    private AiProviderResponse doGenerate(AiProviderRequest request) {
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

    private boolean providerListed(Object providers) {
        if (!(providers instanceof Collection<?> providerList)) {
            return false;
        }
        String expected = type().name().toLowerCase(Locale.ROOT);
        return providerList.stream().anyMatch(provider -> expected.equals(String.valueOf(provider).toLowerCase(Locale.ROOT)));
    }
}
