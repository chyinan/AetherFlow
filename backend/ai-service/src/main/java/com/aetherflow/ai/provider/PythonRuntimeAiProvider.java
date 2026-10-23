package com.aetherflow.ai.provider;

// pattern: Imperative Shell

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
    private static final String HEALTH_OBSERVATION_SOURCE = "PYTHON_AI_RUNTIME";

    private final RestClient pythonAiStatusRestClient;
    private final PythonAiInferenceClientFactory inferenceClientFactory;
    private final SentinelAiGuard sentinelAiGuard;
    private final ObjectMapper objectMapper;

    protected PythonRuntimeAiProvider(RestClient pythonAiStatusRestClient,
                                      PythonAiInferenceClientFactory inferenceClientFactory,
                                      SentinelAiGuard sentinelAiGuard,
                                      ObjectMapper objectMapper) {
        this.pythonAiStatusRestClient = pythonAiStatusRestClient;
        this.inferenceClientFactory = inferenceClientFactory;
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
                Map<String, Object> status = pythonAiStatusRestClient.get()
                        .uri("/ai/status")
                        .retrieve()
                        .body(Map.class);
                long latency = System.currentTimeMillis() - startedAt;
                if (status == null) {
                    return AiProviderHealth.unknown(type(), "Python AI runtime returned no status snapshot",
                            HEALTH_OBSERVATION_SOURCE, Map.of());
                }
                if (!(status.get("llmEnabled") instanceof Boolean llmEnabled)
                        || !(status.get("providers") instanceof Collection<?> configuredProviders)) {
                    return AiProviderHealth.unknown(type(), "Python AI runtime status is incomplete; upstream provider health is unknown",
                            HEALTH_OBSERVATION_SOURCE, runtimeMetadata(status));
                }
                if (!llmEnabled || !providerListed(configuredProviders)) {
                    return AiProviderHealth.unknown(type(), "Python AI runtime did not confirm this provider route is configured",
                            HEALTH_OBSERVATION_SOURCE, runtimeMetadata(status));
                }
                return AiProviderHealth.degraded(type(), latency,
                        "Python AI runtime is reachable; upstream provider availability was not probed",
                        HEALTH_OBSERVATION_SOURCE, runtimeMetadata(status));
            } catch (RuntimeException exception) {
                log.warn("Provider health check failed provider={}", type(), exception);
                return AiProviderHealth.down(type(), "Python AI runtime health request failed",
                        HEALTH_OBSERVATION_SOURCE, Map.of("checkedAt", Instant.now().toString()));
            }
        });
    }

    @Override
    public void stream(AiProviderRequest request, Consumer<AiProviderResponse> consumer) {
        sentinelAiGuard.run("ai-provider-" + type().name().toLowerCase(Locale.ROOT), () ->
                inferenceClientFactory.forTimeout(request.timeout()).post()
                        .uri("/v1/llm/chat/stream")
                        .body(new PythonLlmRequest(
                                type().name().toLowerCase(Locale.ROOT),
                                request.model(),
                                request.prompt(),
                                request.options(),
                                timeoutSeconds(request)))
                        .exchange((clientRequest, clientResponse) -> {
                            if (clientResponse.getStatusCode().isError()) {
                                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                                        "python ai stream returned " + clientResponse.getStatusCode().value());
                            }
                            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                                    clientResponse.getBody(), StandardCharsets.UTF_8))) {
                                String line;
                                boolean completed = false;
                                while ((line = reader.readLine()) != null) {
                                    if (!line.startsWith("data: ")) {
                                        continue;
                                    }
                                    String payload = line.substring("data: ".length()).trim();
                                    if ("[DONE]".equals(payload)) {
                                        completed = true;
                                        break;
                                    }
                                    JsonNode data = objectMapper.readTree(payload);
                                    if (data.hasNonNull("error")) {
                                        throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                                                "python ai stream failed: " + data.path("error").path("message")
                                                        .asText("LLM provider stream failed"));
                                    }
                                    String text = data.path("text").asText("");
                                    if (!text.isEmpty()) {
                                        consumer.accept(new AiProviderResponse(
                                                type(),
                                                data.path("model").asText(request.model()),
                                                text,
                                                objectMapper.convertValue(data.path("metadata"), new TypeReference<Map<String, Object>>() {
                                                })));
                                    }
                                }
                                if (!completed) {
                                    throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                                            "python ai stream ended before completion");
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
                request.options(),
                timeoutSeconds(request)
        );
        log.info("Calling python ai provider={}, model={}", type(), request.model());
        PythonLlmResponse response = inferenceClientFactory.forTimeout(request.timeout()).post()
                .uri("/v1/llm/chat")
                .body(pythonRequest)
                .retrieve()
                .body(PythonLlmResponse.class);
        if (response == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "python ai provider returned empty response");
        }
        return new AiProviderResponse(type(), response.model(), response.text(), response.metadata());
    }

    private boolean providerListed(Collection<?> providerList) {
        String expected = type().name().toLowerCase(Locale.ROOT);
        return providerList.stream().anyMatch(provider -> expected.equals(String.valueOf(provider).toLowerCase(Locale.ROOT)));
    }

    private Map<String, Object> runtimeMetadata(Map<String, Object> status) {
        java.util.LinkedHashMap<String, Object> metadata = new java.util.LinkedHashMap<>();
        if (status.get("llmEnabled") instanceof Boolean enabled) metadata.put("llmEnabled", enabled);
        if (status.get("providers") instanceof Collection<?> providers) {
            metadata.put("configuredProviders", providers.stream().filter(String.class::isInstance).toList());
        }
        metadata.put("upstreamProviderHealth", ProviderHealthStatus.UNKNOWN.name());
        return Map.copyOf(metadata);
    }

    private double timeoutSeconds(AiProviderRequest request) {
        if (request.timeout() == null || request.timeout().isZero() || request.timeout().isNegative()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "AI provider timeout must be positive");
        }
        return Math.max(0.1D, request.timeout().toMillis() / 1000.0D);
    }
}
