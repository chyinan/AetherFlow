package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class ImageGenerationAiNodeExecutor implements AiNodeExecutor {

    private final ImageProviderRegistry providerRegistry;

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
        ImageGenerationResponse response = providerRegistry.getRequired(request.provider().name()).generate(request);
        return result(nodeType(), response);
    }

    protected AiNodeResult result(String nodeType, ImageGenerationResponse response) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("provider", response.provider());
        output.put("mode", response.mode());
        output.put("images", response.images());
        output.put("metadata", response.metadata());
        return new AiNodeResult(nodeType, "SUCCEEDED", output, List.of());
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
