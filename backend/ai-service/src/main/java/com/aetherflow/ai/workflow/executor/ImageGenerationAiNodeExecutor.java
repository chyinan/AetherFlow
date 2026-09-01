package com.aetherflow.ai.workflow.executor;

// pattern: Imperative Shell

import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.provider.ProviderFailureClassifier;
import com.aetherflow.ai.provider.ProviderFailureType;
import com.aetherflow.ai.provider.ProviderRoutingPolicyService;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@Slf4j
public class ImageGenerationAiNodeExecutor implements AiNodeExecutor {

    private final ImageProviderRegistry providerRegistry;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ProviderRoutingPolicyService policyService;

    public ImageGenerationAiNodeExecutor(ImageProviderRegistry providerRegistry) {
        this.providerRegistry = providerRegistry;
    }

    @Override
    public String nodeType() {
        return "IMAGE_GENERATION";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        ImageGenerationRequest request = request(context.payload(), string(context.payload(), "mode", "txt2img"));
        ImageGenerationResponse response = executeWithFailover(request, false, contextUserId(context));
        return result(nodeType(), response);
    }

    protected ImageGenerationResponse executeWithFailover(ImageGenerationRequest request, boolean upscale) {
        return executeWithFailover(request, upscale, null);
    }

    protected ImageGenerationResponse executeWithFailover(ImageGenerationRequest request,
                                                          boolean upscale,
                                                          Long userId) {
        RuntimeException lastException = null;
        List<com.aetherflow.ai.image.ImageGenerationProvider> availableProviders = policyService == null
                ? providerRegistry.orderedAvailableProviders(request.provider().name())
                : providerRegistry.orderedAvailableProviders(
                policyService.orderedImageCandidates(userId, request.provider()));
        for (int index = 0; index < availableProviders.size(); index++) {
            var provider = availableProviders.get(index);
            try {
                ImageGenerationRequest routedRequest = withProvider(request, provider.type());
                ImageGenerationResponse response = upscale ? provider.upscale(routedRequest) : provider.generate(routedRequest);
                if (response == null) {
                    throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "image provider returned no response");
                }
                if (index > 0) {
                    log.info("image provider failover recovered request, provider={}, fallbackIndex={}",
                            provider.type(), index);
                }
                return response;
            } catch (RuntimeException exception) {
                lastException = exception;
                ProviderFailureType failureType = ProviderFailureClassifier.classify(exception);
                if (!failureType.isRetryable()) {
                    throw exception;
                }
                log.warn("image provider failed, provider={}, failureType={}, trying next provider",
                        provider.type(), failureType, exception.getMessage());
            }
        }
        throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                "all image providers failed: " + (lastException == null ? "unknown" : lastException.getMessage()));
    }

    private ImageGenerationRequest withProvider(ImageGenerationRequest request, ImageProviderType provider) {
        return new ImageGenerationRequest(
                provider,
                request.mode(),
                request.prompt(),
                request.negativePrompt(),
                request.seed(),
                request.steps(),
                request.cfgScale(),
                request.sampler(),
                request.scheduler(),
                request.width(),
                request.height(),
                request.batchSize(),
                request.denoiseStrength(),
                request.checkpoint(),
                request.vae(),
                request.lora(),
                request.sourceImageBase64(),
                request.sourceImageContentType(),
                request.workflowJson(),
                request.options(),
                request.timeout());
    }

    protected AiNodeResult result(String nodeType, ImageGenerationResponse response) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("provider", response.provider());
        output.put("mode", response.mode());
        output.put("images", response.images());
        output.put("metadata", response.metadata());
        return new AiNodeResult(nodeType, "SUCCEEDED", output, List.of());
    }

    protected Long contextUserId(AiNodeExecutionContext context) {
        if (context == null || context.taskMessage() == null) {
            return null;
        }
        return context.taskMessage().getUserId();
    }

    protected ImageGenerationRequest request(Map<String, Object> payload, String mode) {
        Map<String, Object> options = map(payload.get("options"));
        if (payload.containsKey("scale")) {
            options.put("scale", payload.get("scale"));
        }
        return new ImageGenerationRequest(
                provider(payload),
                mode,
                string(payload, "prompt", ""),
                string(payload, "negativePrompt", ""),
                longValue(payload.get("seed")),
                positiveInt(payload.get("steps")),
                doubleValue(payload.get("cfgScale")),
                string(payload, "sampler", ""),
                string(payload, "scheduler", ""),
                positiveInt(payload.get("width")),
                positiveInt(payload.get("height")),
                positiveInt(payload.get("batchSize")),
                doubleValue(payload.get("denoiseStrength")),
                string(payload, "checkpoint", ""),
                string(payload, "vae", ""),
                listOfMaps(payload.get("lora")),
                string(payload, "sourceImageBase64", ""),
                string(payload, "sourceImageContentType", ""),
                map(payload.get("workflowJson")),
                options,
                timeout(payload.get("timeoutSeconds"))
        );
    }

    protected ImageProviderRegistry providerRegistry() {
        return providerRegistry;
    }

    private ImageProviderType provider(Map<String, Object> payload) {
        String provider = string(payload, "provider", "COMFYUI");
        String normalized = provider.trim().toUpperCase(Locale.ROOT);
        if ("SD_WEBUI".equals(normalized) || "STABLE_DIFFUSION".equals(normalized)) {
            return ImageProviderType.STABLE_DIFFUSION_WEBUI;
        }
        try {
            return ImageProviderType.from(provider, ImageProviderType.COMFYUI);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported image provider: " + payload.get("provider"));
        }
    }

    protected String string(Map<String, Object> payload, String key, String fallback) {
        Object value = payload.get(key);
        return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value);
    }

    private Integer positiveInt(Object value) {
        Integer parsed = intValue(value);
        return parsed == null || parsed <= 0 ? null : parsed;
    }

    private Integer intValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Double doubleValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Duration timeout(Object value) {
        Integer seconds = intValue(value);
        return seconds == null || seconds <= 0 ? null : Duration.ofSeconds(seconds);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        if (!(value instanceof Map<?, ?> source)) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> copy = new LinkedHashMap<>();
        source.forEach((key, nestedValue) -> copy.put(String.valueOf(key), nestedValue));
        return copy;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOfMaps(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .filter(Map.class::isInstance)
                .map(item -> {
                    Map<String, Object> copy = new LinkedHashMap<>();
                    ((Map<?, ?>) item).forEach((key, nestedValue) -> copy.put(String.valueOf(key), nestedValue));
                    return copy;
                })
                .toList();
    }
}
