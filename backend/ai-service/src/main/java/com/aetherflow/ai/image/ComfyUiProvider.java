package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@ConditionalOnProperty(prefix = "aetherflow.ai.image.comfy", name = "enabled", havingValue = "true")
public class ComfyUiProvider implements ImageGenerationProvider {

    private static final String DEFAULT_CHECKPOINT = "model.safetensors";
    private static final String DEFAULT_SAMPLER = "euler";
    private static final String DEFAULT_SCHEDULER = "normal";

    private final RestClient restClient;
    private final ImageProviderProperties properties;

    public ComfyUiProvider(RestClient.Builder builder, ImageProviderProperties properties) {
        this(createRestClient(builder, properties), properties);
    }

    ComfyUiProvider(RestClient restClient, ImageProviderProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public ImageProviderType type() {
        return ImageProviderType.COMFYUI;
    }

    @Override
    public ImageGenerationResponse generate(ImageGenerationRequest request) {
        try {
            Map<String, Object> queuePayload = queuePayload(request);
            QueueResponse queue = restClient.post()
                    .uri("/prompt")
                    .body(queuePayload)
                    .retrieve()
                    .body(QueueResponse.class);
            if (queue == null || queue.prompt_id() == null || queue.prompt_id().isBlank()) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui queue returned no prompt id");
            }

            HistoryResult history = waitForHistory(queue.prompt_id(), timeout(request));
            List<ComfyImageRef> refs = imageRefs(queue.prompt_id(), history.history());
            if (refs.isEmpty()) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui history returned no images");
            }

            List<GeneratedImagePayload> images = new ArrayList<>(refs.size());
            for (ComfyImageRef ref : refs) {
                images.add(download(ref));
            }

            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("promptId", queue.prompt_id());
            metadata.put("imageCount", images.size());
            metadata.put("queue", history.queue() == null ? Map.of() : history.queue());
            return new ImageGenerationResponse(type().name(), request.mode(), images, metadata);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui request failed");
        }
    }

    private Map<String, Object> queuePayload(ImageGenerationRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>(request.options());
        payload.put("prompt", workflow(request));
        return payload;
    }

    private Map<String, Object> workflow(ImageGenerationRequest request) {
        if (request.workflowJson().isEmpty()) {
            return defaultWorkflow(request);
        }
        Map<String, Object> workflow = mutableWorkflow(request.workflowJson());
        applyParameters(workflow, request);
        return workflow;
    }

    private Map<String, Object> defaultWorkflow(ImageGenerationRequest request) {
        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("1", node("CheckpointLoaderSimple", Map.of(
                "ckpt_name", textOrDefault(request.checkpoint(), DEFAULT_CHECKPOINT)
        )));
        workflow.put("2", node("CLIPTextEncode", Map.of(
                "text", textOrDefault(request.prompt(), ""),
                "clip", List.of("1", 1)
        )));
        workflow.put("3", node("CLIPTextEncode", Map.of(
                "text", textOrDefault(request.negativePrompt(), ""),
                "clip", List.of("1", 1)
        )));
        workflow.put("4", node("EmptyLatentImage", Map.of(
                "width", valueOrDefault(request.width(), 512),
                "height", valueOrDefault(request.height(), 512),
                "batch_size", valueOrDefault(request.batchSize(), 1)
        )));
        workflow.put("5", node("KSampler", Map.of(
                "seed", valueOrDefault(request.seed(), 1L),
                "steps", valueOrDefault(request.steps(), 30),
                "cfg", valueOrDefault(request.cfgScale(), 7.0D),
                "sampler_name", textOrDefault(request.sampler(), DEFAULT_SAMPLER),
                "scheduler", textOrDefault(request.scheduler(), DEFAULT_SCHEDULER),
                "denoise", valueOrDefault(request.denoiseStrength(), 1.0D),
                "model", List.of("1", 0),
                "positive", List.of("2", 0),
                "negative", List.of("3", 0),
                "latent_image", List.of("4", 0)
        )));
        workflow.put("6", node("VAEDecode", Map.of(
                "samples", List.of("5", 0),
                "vae", List.of("1", 2)
        )));
        workflow.put("7", node("SaveImage", Map.of(
                "filename_prefix", "aetherflow",
                "images", List.of("6", 0)
        )));
        addDefaultLoraAndVae(workflow, request);
        return workflow;
    }

    private void addDefaultLoraAndVae(Map<String, Object> workflow, ImageGenerationRequest request) {
        int nextId = 8;
        List<Object> modelRef = List.of("1", 0);
        List<Object> clipRef = List.of("1", 1);
        for (Map<String, Object> lora : request.lora()) {
            Object rawName = lora.get("name");
            String name = rawName == null ? "" : String.valueOf(rawName).trim();
            if (name.isBlank()) {
                continue;
            }
            Object rawWeight = lora.get("weight");
            Object weight = rawWeight == null || String.valueOf(rawWeight).isBlank() ? 1.0D : rawWeight;
            String nodeId = String.valueOf(nextId++);
            workflow.put(nodeId, node("LoraLoader", Map.of(
                    "model", modelRef,
                    "clip", clipRef,
                    "lora_name", name,
                    "strength_model", weight,
                    "strength_clip", weight
            )));
            modelRef = List.of(nodeId, 0);
            clipRef = List.of(nodeId, 1);
        }
        if (!modelRef.equals(List.of("1", 0))) {
            inputs((Map<?, ?>) workflow.get("2")).put("clip", clipRef);
            inputs((Map<?, ?>) workflow.get("3")).put("clip", clipRef);
            inputs((Map<?, ?>) workflow.get("5")).put("model", modelRef);
        }
        if (request.vae() != null && !request.vae().isBlank()) {
            String nodeId = String.valueOf(nextId);
            workflow.put(nodeId, node("VAELoader", Map.of("vae_name", request.vae())));
            inputs((Map<?, ?>) workflow.get("6")).put("vae", List.of(nodeId, 0));
        }
    }

    private Map<String, Object> node(String classType, Map<String, Object> inputs) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("class_type", classType);
        node.put("inputs", new LinkedHashMap<>(inputs));
        return node;
    }

    private Map<String, Object> mutableWorkflow(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        source.forEach((key, value) -> copy.put(key, mutableValue(value)));
        return copy;
    }

    @SuppressWarnings("unchecked")
    private Object mutableValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            map.forEach((key, nestedValue) -> copy.put(String.valueOf(key), mutableValue(nestedValue)));
            return copy;
        }
        if (value instanceof List<?> list) {
            return new ArrayList<>(list.stream().map(this::mutableValue).toList());
        }
        return value;
    }

    private void applyParameters(Map<String, Object> workflow, ImageGenerationRequest request) {
        int clipTextIndex = 0;
        for (Object nodeValue : workflow.values()) {
            if (!(nodeValue instanceof Map<?, ?> node)) {
                continue;
            }
            String classType = string(node.get("class_type")).toLowerCase(Locale.ROOT);
            Map<String, Object> inputs = inputs(node);
            if (inputs == null) {
                continue;
            }

            if ("cliptextencode".equals(classType)) {
                clipTextIndex++;
                if (clipTextIndex == 1 && request.prompt() != null) {
                    inputs.put("text", request.prompt());
                } else if (clipTextIndex == 2 && request.negativePrompt() != null) {
                    inputs.put("text", request.negativePrompt());
                }
            } else if ("ksampler".equals(classType)) {
                put(inputs, "seed", request.seed());
                put(inputs, "steps", request.steps());
                put(inputs, "cfg", request.cfgScale());
                put(inputs, "sampler_name", request.sampler());
                put(inputs, "scheduler", request.scheduler());
                put(inputs, "denoise", request.denoiseStrength());
            } else if ("emptylatentimage".equals(classType)) {
                put(inputs, "width", request.width());
                put(inputs, "height", request.height());
                put(inputs, "batch_size", request.batchSize());
            } else if ("checkpointloadersimple".equals(classType)) {
                put(inputs, "ckpt_name", request.checkpoint());
            } else if ("vaeloader".equals(classType)) {
                put(inputs, "vae_name", request.vae());
            } else if ("loraloader".equals(classType) || "loraloadermodelonly".equals(classType)) {
                applyFirstLora(inputs, request.lora());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> inputs(Map<?, ?> node) {
        Object inputs = node.get("inputs");
        if (inputs instanceof Map<?, ?> inputMap) {
            return (Map<String, Object>) inputMap;
        }
        return null;
    }

    private void applyFirstLora(Map<String, Object> inputs, List<Map<String, Object>> loras) {
        for (Map<String, Object> lora : loras) {
            Object rawName = lora.get("name");
            String name = rawName == null ? "" : String.valueOf(rawName).trim();
            if (name.isBlank()) {
                continue;
            }
            Object weight = lora.get("weight");
            Object effectiveWeight = weight == null || String.valueOf(weight).isBlank() ? 1.0D : weight;
            inputs.put("lora_name", name);
            inputs.put("strength_model", effectiveWeight);
            inputs.put("strength_clip", effectiveWeight);
            return;
        }
    }

    private HistoryResult waitForHistory(String promptId, Duration timeout) {
        Instant deadline = Instant.now().plus(timeout);
        Map<String, Object> lastQueue = Map.of();
        while (!Instant.now().isAfter(deadline)) {
            lastQueue = queue();
            Map<String, Object> history = history(promptId);
            if (history.containsKey(promptId)) {
                return new HistoryResult(history, lastQueue);
            }
            sleep(properties.getComfy().getPollInterval());
        }
        throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui generation timed out");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> queue() {
        Map<String, Object> queue = restClient.get()
                .uri("/queue")
                .retrieve()
                .body(Map.class);
        return queue == null ? Map.of() : queue;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> history(String promptId) {
        Map<String, Object> history = restClient.get()
                .uri("/history/{promptId}", promptId)
                .retrieve()
                .body(Map.class);
        return history == null ? Map.of() : history;
    }

    private Duration timeout(ImageGenerationRequest request) {
        if (request.timeout() != null && !request.timeout().isNegative() && !request.timeout().isZero()) {
            return request.timeout();
        }
        Duration maxWait = properties.getComfy().getMaxWait();
        return maxWait == null || maxWait.isNegative() || maxWait.isZero() ? Duration.ofMinutes(10) : maxWait;
    }

    private void sleep(Duration duration) {
        if (duration == null || duration.isZero() || duration.isNegative()) {
            return;
        }
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui polling interrupted");
        }
    }

    private List<ComfyImageRef> imageRefs(String promptId, Map<String, Object> history) {
        Object promptHistory = history.get(promptId);
        if (!(promptHistory instanceof Map<?, ?> promptMap)) {
            return List.of();
        }
        Object outputs = promptMap.get("outputs");
        if (!(outputs instanceof Map<?, ?> outputMap)) {
            return List.of();
        }
        List<ComfyImageRef> refs = new ArrayList<>();
        for (Object output : outputMap.values()) {
            if (!(output instanceof Map<?, ?> nodeOutput)) {
                continue;
            }
            Object images = nodeOutput.get("images");
            if (!(images instanceof Iterable<?> iterable)) {
                continue;
            }
            for (Object image : iterable) {
                if (!(image instanceof Map<?, ?> imageMap)) {
                    continue;
                }
                String filename = textOrDefault(imageMap.get("filename"), "");
                if (filename.isBlank()) {
                    continue;
                }
                refs.add(new ComfyImageRef(
                        filename,
                        textOrDefault(imageMap.get("subfolder"), ""),
                        textOrDefault(imageMap.get("type"), "output")
                ));
            }
        }
        return refs;
    }

    private GeneratedImagePayload download(ComfyImageRef ref) {
        ResponseEntity<byte[]> response = restClient.get()
                .uri(uriBuilder -> uriBuilder.path("/view")
                        .queryParam("filename", ref.filename())
                        .queryParam("subfolder", ref.subfolder())
                        .queryParam("type", ref.type())
                        .build())
                .retrieve()
                .toEntity(byte[].class);
        byte[] bytes = response.getBody() == null ? new byte[0] : response.getBody();
        if (bytes.length == 0) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui returned blank image");
        }
        String contentType = response.getHeaders().getContentType() == null
                ? "image/png"
                : response.getHeaders().getContentType().toString();
        return new GeneratedImagePayload(ref.filename(), contentType,
                Base64.getEncoder().encodeToString(bytes), (long) bytes.length,
                Map.of("subfolder", ref.subfolder(), "type", ref.type()));
    }

    private void put(Map<String, Object> values, String key, Object value) {
        if (value != null && !(value instanceof String stringValue && stringValue.isBlank())) {
            values.put(key, value);
        }
    }

    private Object valueOrDefault(Object value, Object fallback) {
        return value == null ? fallback : value;
    }

    private String textOrDefault(Object value, String fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        return String.valueOf(value);
    }

    private String string(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static RestClient createRestClient(RestClient.Builder builder, ImageProviderProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        int timeoutMillis = timeoutMillis(properties.getDefaultTimeout());
        requestFactory.setConnectTimeout(timeoutMillis);
        requestFactory.setReadTimeout(timeoutMillis);
        return builder.baseUrl(properties.getComfy().getBaseUrl())
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

    record QueueResponse(String prompt_id) {
    }

    record HistoryResult(Map<String, Object> history, Map<String, Object> queue) {
    }

    record ComfyImageRef(String filename, String subfolder, String type) {
    }
}
