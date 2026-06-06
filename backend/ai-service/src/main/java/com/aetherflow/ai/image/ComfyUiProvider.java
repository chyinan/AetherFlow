package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
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
    private final String baseUrl;
    private final boolean perRequestTimeoutEnabled;

    public ComfyUiProvider(RestClient.Builder builder, ImageProviderProperties properties) {
        this(createRestClient(builder, properties.getComfy().getBaseUrl(), properties.getDefaultTimeout()),
                properties, true);
    }

    ComfyUiProvider(RestClient restClient, ImageProviderProperties properties) {
        this(restClient, properties, false);
    }

    private ComfyUiProvider(RestClient restClient, ImageProviderProperties properties, boolean perRequestTimeoutEnabled) {
        this.restClient = restClient;
        this.properties = properties;
        this.baseUrl = properties.getComfy().getBaseUrl();
        this.perRequestTimeoutEnabled = perRequestTimeoutEnabled;
    }

    @Override
    public ImageProviderType type() {
        return ImageProviderType.COMFYUI;
    }

    @Override
    public ImageGenerationResponse generate(ImageGenerationRequest request) {
        String mode = normalizeMode(request.mode());
        try {
            RestClient client = restClient(request);
            ComfyUploadResponse upload = "img2img".equals(mode) ? uploadSourceImage(client, request) : null;
            Map<String, Object> queuePayload = queuePayload(request, mode, upload);
            return executeQueuedWorkflow(client, request, mode, queuePayload);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui request failed");
        }
    }

    @Override
    public ImageGenerationResponse upscale(ImageGenerationRequest request) {
        try {
            RestClient client = restClient(request);
            ComfyUploadResponse upload = uploadSourceImage(client, request);
            Map<String, Object> queuePayload = new LinkedHashMap<>(request.options());
            queuePayload.put("prompt", upscaleWorkflow(request, upload));
            queuePayload.putIfAbsent("client_id", "aetherflow");
            return executeQueuedWorkflow(client, request, "upscale", queuePayload);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui request failed");
        }
    }

    private ImageGenerationResponse executeQueuedWorkflow(RestClient client, ImageGenerationRequest request, String mode,
                                                         Map<String, Object> queuePayload) {
        QueueResponse queue = client.post()
                .uri("/prompt")
                .body(queuePayload)
                .retrieve()
                .body(QueueResponse.class);
        if (queue == null || queue.prompt_id() == null || queue.prompt_id().isBlank()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui queue returned no prompt id");
        }

        HistoryResult history = waitForHistory(client, queue.prompt_id(), timeout(request));
        List<ComfyImageRef> refs = imageRefs(queue.prompt_id(), history.history());
        if (refs.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui history returned no images");
        }

        List<GeneratedImagePayload> images = new ArrayList<>(refs.size());
        for (ComfyImageRef ref : refs) {
            images.add(download(client, ref));
        }

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("promptId", queue.prompt_id());
        metadata.put("imageCount", images.size());
        metadata.put("queue", history.queue() == null ? Map.of() : history.queue());
        return new ImageGenerationResponse(type().name(), mode, images, metadata);
    }

    private Map<String, Object> queuePayload(ImageGenerationRequest request, String mode, ComfyUploadResponse upload) {
        Map<String, Object> payload = new LinkedHashMap<>(request.options());
        payload.put("prompt", workflow(request, mode, upload));
        payload.putIfAbsent("client_id", "aetherflow");
        return payload;
    }

    private Map<String, Object> workflow(ImageGenerationRequest request, String mode, ComfyUploadResponse upload) {
        if ("img2img".equals(mode) && (request.sourceImageBase64() == null || request.sourceImageBase64().isBlank())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "img2img source image is required");
        }
        if (request.workflowJson().isEmpty()) {
            return defaultWorkflow(request, mode, upload);
        }
        Map<String, Object> workflow = mutableWorkflow(request.workflowJson());
        applyParameters(workflow, request, mode, upload);
        return workflow;
    }

    private String normalizeMode(String mode) {
        String normalized = mode == null ? "" : mode.trim().toLowerCase(Locale.ROOT);
        if ("txt2img".equals(normalized) || "img2img".equals(normalized) || "workflow".equals(normalized)) {
            return normalized;
        }
        throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported comfyui mode: " + mode);
    }

    private Map<String, Object> defaultWorkflow(ImageGenerationRequest request, String mode, ComfyUploadResponse upload) {
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
        List<Object> latentRef;
        String samplerNodeId;
        if ("img2img".equals(mode)) {
            workflow.put("4", node("LoadImage", Map.of(
                    "image", sourceImageName(request, upload)
            )));
            workflow.put("5", node("VAEEncode", Map.of(
                    "pixels", List.of("4", 0),
                    "vae", List.of("1", 2)
            )));
            latentRef = List.of("5", 0);
            samplerNodeId = "6";
        } else {
            workflow.put("4", node("EmptyLatentImage", Map.of(
                    "width", valueOrDefault(request.width(), 512),
                    "height", valueOrDefault(request.height(), 512),
                    "batch_size", valueOrDefault(request.batchSize(), 1)
            )));
            latentRef = List.of("4", 0);
            samplerNodeId = "5";
        }
        workflow.put(samplerNodeId, node("KSampler", Map.of(
                "seed", valueOrDefault(request.seed(), 1L),
                "steps", valueOrDefault(request.steps(), 30),
                "cfg", valueOrDefault(request.cfgScale(), 7.0D),
                "sampler_name", textOrDefault(request.sampler(), DEFAULT_SAMPLER),
                "scheduler", textOrDefault(request.scheduler(), DEFAULT_SCHEDULER),
                "denoise", valueOrDefault(request.denoiseStrength(), 1.0D),
                "model", List.of("1", 0),
                "positive", List.of("2", 0),
                "negative", List.of("3", 0),
                "latent_image", latentRef
        )));
        String decodeNodeId = "img2img".equals(mode) ? "7" : "6";
        String saveNodeId = "img2img".equals(mode) ? "8" : "7";
        workflow.put(decodeNodeId, node("VAEDecode", Map.of(
                "samples", List.of(samplerNodeId, 0),
                "vae", List.of("1", 2)
        )));
        workflow.put(saveNodeId, node("SaveImage", Map.of(
                "filename_prefix", "aetherflow",
                "images", List.of(decodeNodeId, 0)
        )));
        addDefaultLoraAndVae(workflow, request, samplerNodeId, decodeNodeId);
        return workflow;
    }

    private Map<String, Object> upscaleWorkflow(ImageGenerationRequest request, ComfyUploadResponse upload) {
        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("1", node("LoadImage", Map.of(
                "image", sourceImageName(request, upload)
        )));
        workflow.put("2", node("ImageScaleBy", Map.of(
                "image", List.of("1", 0),
                "scale_by", positiveNumber(request.options().get("scale"), 2)
        )));
        workflow.put("3", node("SaveImage", Map.of(
                "filename_prefix", "aetherflow-upscale",
                "images", List.of("2", 0)
        )));
        return workflow;
    }

    private String sourceImageName(ImageGenerationRequest request, ComfyUploadResponse upload) {
        if (upload != null && upload.name() != null && !upload.name().isBlank()) {
            return upload.name();
        }
        Object configured = request.options().get("sourceImageName");
        String name = configured == null ? "" : String.valueOf(configured).trim();
        return name.isBlank() ? "source.png" : name;
    }

    private void addDefaultLoraAndVae(Map<String, Object> workflow, ImageGenerationRequest request,
                                      String samplerNodeId, String decodeNodeId) {
        int nextId = nextNumericNodeId(workflow);
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
            inputs((Map<?, ?>) workflow.get(samplerNodeId)).put("model", modelRef);
        }
        if (request.vae() != null && !request.vae().isBlank()) {
            String nodeId = String.valueOf(nextId);
            workflow.put(nodeId, node("VAELoader", Map.of("vae_name", request.vae())));
            inputs((Map<?, ?>) workflow.get(decodeNodeId)).put("vae", List.of(nodeId, 0));
        }
    }

    private int nextNumericNodeId(Map<String, Object> workflow) {
        int max = 0;
        for (String key : workflow.keySet()) {
            try {
                max = Math.max(max, Integer.parseInt(key));
            } catch (NumberFormatException ignored) {
                // ComfyUI node ids are usually numeric, but custom exports may include non-numeric ids.
            }
        }
        return max + 1;
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

    private void applyParameters(Map<String, Object> workflow, ImageGenerationRequest request, String mode,
                                 ComfyUploadResponse upload) {
        int clipTextIndex = 0;
        int loraIndex = 0;
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
            } else if ("unetloader".equals(classType)) {
                put(inputs, "unet_name", request.checkpoint());
            } else if ("vaeloader".equals(classType)) {
                put(inputs, "vae_name", request.vae());
            } else if ("loraloader".equals(classType) || "loraloadermodelonly".equals(classType)) {
                loraIndex = applyLora(inputs, request.lora(), loraIndex);
            } else if ("emptysd3latentimage".equals(classType)) {
                put(inputs, "width", request.width());
                put(inputs, "height", request.height());
                put(inputs, "batch_size", request.batchSize());
            } else if ("randomnoise".equals(classType)) {
                put(inputs, "noise_seed", request.seed());
            } else if ("basicscheduler".equals(classType)) {
                put(inputs, "steps", request.steps());
                put(inputs, "scheduler", request.scheduler());
                put(inputs, "denoise", request.denoiseStrength());
            } else if ("cfgguider".equals(classType)) {
                put(inputs, "cfg", request.cfgScale());
            } else if ("ksamplerselect".equals(classType)) {
                put(inputs, "sampler_name", request.sampler());
            } else if ("loadimage".equals(classType) && "img2img".equals(mode)) {
                inputs.put("image", sourceImageName(request, upload));
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

    private int applyLora(Map<String, Object> inputs, List<Map<String, Object>> loras, int startIndex) {
        for (int index = startIndex; index < loras.size(); index++) {
            Map<String, Object> lora = loras.get(index);
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
            return index + 1;
        }
        return loras.size();
    }

    private ComfyUploadResponse uploadSourceImage(RestClient client, ImageGenerationRequest request) {
        if (request.sourceImageBase64() == null || request.sourceImageBase64().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "img2img source image is required");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(request.sourceImageBase64());
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "img2img source image is not valid base64");
        }
        if (bytes.length == 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "img2img source image is required");
        }
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("image", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return sourceImageName(request, null);
            }
        });
        body.add("type", "input");
        body.add("overwrite", "true");
        ComfyUploadResponse response = client.post()
                .uri("/upload/image")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(ComfyUploadResponse.class);
        if (response == null || response.name() == null || response.name().isBlank()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui upload returned no image name");
        }
        return response;
    }

    private HistoryResult waitForHistory(RestClient client, String promptId, Duration timeout) {
        Instant deadline = Instant.now().plus(timeout);
        Map<String, Object> lastQueue = Map.of();
        while (!Instant.now().isAfter(deadline)) {
            lastQueue = queue(client);
            Map<String, Object> history = history(client, promptId);
            if (history.containsKey(promptId)) {
                return new HistoryResult(history, lastQueue);
            }
            sleep(properties.getComfy().getPollInterval());
        }
        throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui generation timed out");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> queue(RestClient client) {
        Map<String, Object> queue = client.get()
                .uri("/queue")
                .retrieve()
                .body(Map.class);
        return queue == null ? Map.of() : queue;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> history(RestClient client, String promptId) {
        Map<String, Object> history = client.get()
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

    private GeneratedImagePayload download(RestClient client, ComfyImageRef ref) {
        ResponseEntity<byte[]> response = client.get()
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

    private String textOrDefault(Object value, String fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        return String.valueOf(value);
    }

    private String string(Object value) {
        return value == null ? "" : String.valueOf(value);
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

    record QueueResponse(String prompt_id) {
    }

    record ComfyUploadResponse(String name, String subfolder, String type) {
    }

    record HistoryResult(Map<String, Object> history, Map<String, Object> queue) {
    }

    record ComfyImageRef(String filename, String subfolder, String type) {
    }
}
