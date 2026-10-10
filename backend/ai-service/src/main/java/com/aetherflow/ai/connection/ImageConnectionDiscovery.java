package com.aetherflow.ai.connection;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.ai.image.ImageProviderType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

@Service
public class ImageConnectionDiscovery {
    private static final List<String> CATALOGS = List.of("checkpoints", "vaes", "loras", "samplers", "schedulers", "upscalers");
    private static final Duration TOTAL_TIMEOUT = Duration.ofSeconds(8);
    private final BiFunction<String, Duration, RestClient> clients;
    private final Duration requestTimeout;

    @Autowired
    public ImageConnectionDiscovery(RestClient.Builder builder, ImageProviderProperties properties) {
        this((baseUrl, timeout) -> {
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
                @Override
                protected void prepareConnection(HttpURLConnection connection, String method) throws IOException {
                    super.prepareConnection(connection, method);
                    // 只探测明确填写的服务，不跟随到其他地址。
                    connection.setInstanceFollowRedirects(false);
                }
            };
            int millis = Math.max(1, Math.toIntExact(timeout.toMillis()));
            factory.setConnectTimeout(millis);
            factory.setReadTimeout(millis);
            return builder.clone().baseUrl(baseUrl).requestFactory(factory).build();
        }, properties.getHealthTimeout());
    }

    ImageConnectionDiscovery(BiFunction<String, Duration, RestClient> clients, Duration timeout) {
        this.clients = clients;
        this.requestTimeout = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofSeconds(2) : timeout.compareTo(Duration.ofSeconds(2)) > 0 ? Duration.ofSeconds(2) : timeout;
    }

    public NodeConnectionProbe probe(NodeConnectionProfile profile, String checkpoint, String nodeType) {
        long deadline = System.nanoTime() + TOTAL_TIMEOUT.toNanos();
        Map<String, List<String>> models = new LinkedHashMap<>();
        CATALOGS.forEach(key -> models.put(key, List.of()));
        List<String> unavailable = new ArrayList<>();
        List<String> capabilities = new ArrayList<>();
        try {
            if (ImageProviderType.COMFYUI.name().equals(profile.provider())) {
                Object response = get(profile.baseUrl(), "/object_info", deadline);
                if (!(response instanceof Map<?, ?> info) || info.isEmpty()) {
                    return NodeConnectionProbe.unavailable("unreachable", "服务未返回有效的 ComfyUI 节点目录");
                }
                comfyCatalog(info, models, unavailable, "checkpoints", "CheckpointLoaderSimple", "ckpt_name");
                comfyCatalog(info, models, unavailable, "vaes", "VAELoader", "vae_name");
                comfyCatalog(info, models, unavailable, "loras", "LoraLoader", "lora_name");
                comfyCatalog(info, models, unavailable, "samplers", "KSampler", "sampler_name");
                comfyCatalog(info, models, unavailable, "schedulers", "KSampler", "scheduler");
                // 当前执行器使用 ImageScaleBy，因此这里列出插值方法而非放大模型。
                comfyCatalog(info, models, unavailable, "upscalers", "ImageScaleBy", "upscale_method");
                if (hasNodes(info, "CheckpointLoaderSimple", "CLIPTextEncode", "KSampler", "EmptyLatentImage", "VAEDecode", "SaveImage")) {
                    capabilities.add("IMAGE_GENERATION");
                }
                if (hasNodes(info, "LoadImage", "ImageScaleBy", "SaveImage")) {
                    capabilities.add("UPSCALE");
                }
            } else {
                if (!(get(profile.baseUrl(), "/sdapi/v1/options", deadline) instanceof Map<?, ?>)) {
                    return NodeConnectionProbe.unavailable("unreachable", "服务未返回有效的 Stable Diffusion WebUI 配置");
                }
                capabilities.addAll(List.of("IMAGE_GENERATION", "UPSCALE"));
                sdCatalog(profile, deadline, models, unavailable, "checkpoints", "sd-models", "title");
                sdCatalog(profile, deadline, models, unavailable, "vaes", "sd-vae", "model_name");
                sdCatalog(profile, deadline, models, unavailable, "loras", "loras", "name");
                sdCatalog(profile, deadline, models, unavailable, "samplers", "samplers", "name");
                sdCatalog(profile, deadline, models, unavailable, "schedulers", "schedulers", "name");
                sdCatalog(profile, deadline, models, unavailable, "upscalers", "upscalers", "name");
            }
        } catch (RestClientException | IllegalStateException exception) {
            return NodeConnectionProbe.unavailable("unreachable", "AI 服务无法连接或响应超时，请检查服务地址与运行状态");
        }
        List<String> warnings = new ArrayList<>();
        if (!unavailable.isEmpty()) {
            warnings.add("部分目录无法读取，不能据此判断模型缺失：" + String.join("、", unavailable));
        }
        warnings.add("目录仅证明服务公开的可选项，不能确认模型是否已加载到显存");
        String status = "usable";
        String message = "后端已连接到服务，可读取可用选项";
        if (capabilities.isEmpty() || (nodeType != null && !nodeType.isBlank() && !capabilities.contains(nodeType))) {
            status = "unconfigured";
            message = "该服务未提供所选节点需要的能力";
        } else if (("IMAGE_GENERATION".equals(nodeType) || (checkpoint != null && !checkpoint.isBlank())) && !unavailable.contains("checkpoints")
                && (models.get("checkpoints").isEmpty()
                || (checkpoint != null && !checkpoint.isBlank() && !models.get("checkpoints").contains(checkpoint)))) {
            status = "missing_model";
            message = checkpoint == null || checkpoint.isBlank() ? "服务未发现可用的 Checkpoint" : "所选 Checkpoint 不在服务目录中";
        }
        return new NodeConnectionProbe(status, message, "backend", new NodeConnectionProbe.Models(
                models.get("checkpoints"), models.get("vaes"), models.get("loras"), models.get("samplers"),
                models.get("schedulers"), models.get("upscalers")), List.copyOf(capabilities), List.copyOf(warnings), List.copyOf(unavailable));
    }

    private Object get(String baseUrl, String path, long deadline) {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) {
            throw new IllegalStateException("探测时间预算已耗尽");
        }
        Duration timeout = Duration.ofNanos(Math.min(remaining, requestTimeout.toNanos()));
        return clients.apply(baseUrl, timeout).get().uri(path).retrieve()
                .onStatus(status -> !status.is2xxSuccessful(), (request, response) -> {
                    throw new IllegalStateException("服务未返回成功状态");
                }).body(Object.class);
    }

    private void sdCatalog(NodeConnectionProfile profile, long deadline, Map<String, List<String>> models,
                           List<String> unavailable, String key, String endpoint, String field) {
        try {
            Object response = get(profile.baseUrl(), "/sdapi/v1/" + endpoint, deadline);
            if (!(response instanceof List<?> items)) {
                unavailable.add(key);
                return;
            }
            if (items.size() > 2000 || items.stream().anyMatch(item -> !(item instanceof Map<?, ?> map)
                    || !(map.get(field) instanceof String value) || value.isBlank())) {
                // 畸形或过大的目录仅供展示，不能把被过滤或截断的列表当作完整证据。
                unavailable.add(key);
            }
            models.put(key, items.stream().filter(Map.class::isInstance).map(Map.class::cast)
                    .map(item -> item.get(field)).filter(String.class::isInstance).map(String.class::cast)
                    .filter(value -> !value.isBlank()).distinct().limit(2000).toList());
        } catch (RestClientException | IllegalStateException exception) {
            unavailable.add(key);
        }
    }

    private void comfyCatalog(Map<?, ?> info, Map<String, List<String>> models, List<String> unavailable,
                              String key, String node, String field) {
        Object descriptor = nested(info, node, "input", "required", field);
        if (!(descriptor instanceof List<?> options) || options.isEmpty() || !(options.get(0) instanceof List<?> values)) {
            unavailable.add(key);
            return;
        }
        if (values.size() > 2000 || values.stream().anyMatch(value -> !(value instanceof String text) || text.isBlank())) {
            unavailable.add(key);
        }
        models.put(key, values.stream().filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> !value.isBlank()).distinct().limit(2000).toList());
    }

    private Object nested(Map<?, ?> source, String... keys) {
        Object value = source;
        for (String key : keys) {
            if (!(value instanceof Map<?, ?> map)) {
                return null;
            }
            value = map.get(key);
        }
        return value;
    }

    private boolean hasNodes(Map<?, ?> info, String... nodes) {
        return java.util.Arrays.stream(nodes).allMatch(info::containsKey);
    }
}
