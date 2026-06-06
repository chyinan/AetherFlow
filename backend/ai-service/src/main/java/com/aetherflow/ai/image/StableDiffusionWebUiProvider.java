package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@ConditionalOnProperty(prefix = "aetherflow.ai.image.stable-diffusion", name = "enabled", havingValue = "true")
public class StableDiffusionWebUiProvider implements ImageGenerationProvider {

    private final RestClient restClient;
    private final String baseUrl;
    private final boolean perRequestTimeoutEnabled;

    public StableDiffusionWebUiProvider(RestClient.Builder builder, ImageProviderProperties properties) {
        this(createRestClient(builder, properties.getStableDiffusion().getBaseUrl(), properties.getDefaultTimeout()),
                properties, true);
    }

    StableDiffusionWebUiProvider(RestClient restClient, ImageProviderProperties properties) {
        this(restClient, properties, false);
    }

    private StableDiffusionWebUiProvider(RestClient restClient, ImageProviderProperties properties,
                                        boolean perRequestTimeoutEnabled) {
        this.restClient = restClient;
        this.baseUrl = properties.getStableDiffusion().getBaseUrl();
        this.perRequestTimeoutEnabled = perRequestTimeoutEnabled;
    }

    @Override
    public ImageProviderType type() {
        return ImageProviderType.STABLE_DIFFUSION_WEBUI;
    }

    @Override
    public ImageGenerationResponse generate(ImageGenerationRequest request) {
        String mode = normalizeMode(request.mode());
        boolean img2img = "img2img".equals(mode);
        StableDiffusionResponse response;
        try {
            response = restClient(request).post()
                    .uri(img2img ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img")
                    .body(toPayload(request, img2img))
                    .retrieve()
                    .body(StableDiffusionResponse.class);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "stable diffusion webui request failed");
        }

        if (response == null || response.images() == null || response.images().isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "stable diffusion webui returned no images");
        }

        List<GeneratedImagePayload> images = new ArrayList<>();
        for (int index = 0; index < response.images().size(); index++) {
            String base64Data = response.images().get(index);
            if (base64Data == null || base64Data.isBlank()) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "stable diffusion webui returned blank image");
            }
            images.add(new GeneratedImagePayload(
                    "sd-webui-" + (index + 1) + ".png",
                    "image/png",
                    base64Data,
                    null,
                    Map.of("index", index)
            ));
        }

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("parameters", response.parameters() == null ? Map.of() : response.parameters());
        metadata.put("info", response.info() == null ? "" : response.info());
        return new ImageGenerationResponse(type().name(), mode, images, metadata);
    }

    @Override
    public ImageGenerationResponse upscale(ImageGenerationRequest request) {
        StableDiffusionUpscaleResponse response;
        try {
            response = restClient(request).post()
                    .uri("/sdapi/v1/extra-single-image")
                    .body(toUpscalePayload(request))
                    .retrieve()
                    .body(StableDiffusionUpscaleResponse.class);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "stable diffusion webui upscale request failed");
        }
        if (response == null || response.image() == null || response.image().isBlank()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "stable diffusion webui returned blank upscale image");
        }
        GeneratedImagePayload image = new GeneratedImagePayload(
                "sd-webui-upscale-1.png",
                "image/png",
                response.image(),
                null,
                Map.of("index", 0)
        );
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("info", response.html_info() == null ? "" : response.html_info());
        return new ImageGenerationResponse(type().name(), "upscale", List.of(image), metadata);
    }

    private Map<String, Object> toPayload(ImageGenerationRequest request, boolean img2img) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.putAll(request.options());
        payload.put("prompt", promptWithLora(request.prompt(), request.lora()));
        payload.put("negative_prompt", request.negativePrompt() == null ? "" : request.negativePrompt());
        put(payload, "seed", request.seed());
        put(payload, "steps", request.steps());
        put(payload, "cfg_scale", request.cfgScale());
        put(payload, "sampler_name", request.sampler());
        put(payload, "scheduler", request.scheduler());
        put(payload, "width", request.width());
        put(payload, "height", request.height());
        put(payload, "batch_size", request.batchSize());
        put(payload, "denoising_strength", request.denoiseStrength());
        putOverrideSettings(payload, request);

        if (img2img) {
            if (request.sourceImageBase64() == null || request.sourceImageBase64().isBlank()) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "img2img source image is required");
            }
            payload.put("init_images", List.of(request.sourceImageBase64()));
        }
        return payload;
    }

    private Map<String, Object> toUpscalePayload(ImageGenerationRequest request) {
        if (request.sourceImageBase64() == null || request.sourceImageBase64().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "upscale source image is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>(request.options());
        Object scale = payload.remove("scale");
        Object upscaler = payload.remove("upscaler");
        payload.put("image", request.sourceImageBase64());
        payload.put("upscaling_resize", positiveNumber(scale, 2));
        if (upscaler != null && !String.valueOf(upscaler).isBlank()) {
            payload.put("upscaler_1", String.valueOf(upscaler));
        }
        return payload;
    }

    private String normalizeMode(String mode) {
        String normalized = mode == null ? "" : mode.trim().toLowerCase(Locale.ROOT);
        if ("txt2img".equals(normalized) || "img2img".equals(normalized)) {
            return normalized;
        }
        throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported stable diffusion webui mode: " + mode);
    }

    @SuppressWarnings("unchecked")
    private void putOverrideSettings(Map<String, Object> payload, ImageGenerationRequest request) {
        Map<String, Object> overrideSettings = new LinkedHashMap<>();
        Object configured = request.options().get("override_settings");
        if (configured instanceof Map<?, ?> configuredMap) {
            configuredMap.forEach((key, value) -> overrideSettings.put(String.valueOf(key), value));
        }
        if (request.checkpoint() != null && !request.checkpoint().isBlank()) {
            overrideSettings.put("sd_model_checkpoint", request.checkpoint());
        }
        if (request.vae() != null && !request.vae().isBlank()) {
            overrideSettings.put("sd_vae", request.vae());
        }
        if (!overrideSettings.isEmpty()) {
            payload.put("override_settings", overrideSettings);
        }
    }

    private String promptWithLora(String prompt, List<Map<String, Object>> loras) {
        StringBuilder builder = new StringBuilder(prompt == null ? "" : prompt);
        for (Map<String, Object> lora : loras) {
            Object rawName = lora.get("name");
            String name = rawName == null ? "" : String.valueOf(rawName).trim();
            if (name.isBlank()) {
                continue;
            }
            Object rawWeight = lora.get("weight");
            Object weight = rawWeight == null || String.valueOf(rawWeight).isBlank() ? 1.0D : rawWeight;
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append("<lora:").append(name).append(':').append(weight).append('>');
        }
        return builder.toString().trim();
    }

    private void put(Map<String, Object> payload, String key, Object value) {
        if (value != null) {
            payload.put(key, value);
        }
    }

    private Object positiveNumber(Object value, int fallback) {
        if (value instanceof Number number && number.doubleValue() > 0) {
            return number;
        }
        try {
            double parsed = value == null ? fallback : Double.parseDouble(String.valueOf(value));
            return parsed > 0 ? parsed : fallback;
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private RestClient restClient(ImageGenerationRequest request) {
        if (!perRequestTimeoutEnabled || request.timeout() == null) {
            return restClient;
        }
        return createRestClient(RestClient.builder(), baseUrl, request.timeout());
    }

    private static RestClient createRestClient(RestClient.Builder builder, String baseUrl, Duration timeout) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        int timeoutMillis = timeoutMillis(timeout);
        requestFactory.setConnectTimeout(timeoutMillis);
        requestFactory.setReadTimeout(timeoutMillis);
        return builder.baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    private static int timeoutMillis(Duration timeout) {
        Duration effective = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofMinutes(5)
                : timeout;
        long millis = effective.toMillis();
        if (millis <= 0) {
            return 1;
        }
        return Math.toIntExact(Math.min(millis, Integer.MAX_VALUE));
    }

    record StableDiffusionResponse(List<String> images, Map<String, Object> parameters, String info) {
    }

    record StableDiffusionUpscaleResponse(String image, String html_info) {
    }
}
