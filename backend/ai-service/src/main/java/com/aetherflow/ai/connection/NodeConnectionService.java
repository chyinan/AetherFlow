package com.aetherflow.ai.connection;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.ai.image.ImageGenerationProvider;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NodeConnectionValidationRequest;
import com.aetherflow.common.dto.NodeConnectionValidationRequest.NodeSelection;
import com.aetherflow.common.dto.NodeConnectionValidationResponse;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NodeConnectionService {
    public static final String DEPLOYMENT_COMFYUI = "deployment-comfyui";
    public static final String DEPLOYMENT_SD = "deployment-sd";
    private final NodeConnectionRepository repository;
    private final ImageConnectionDiscovery discovery;
    private final NodeConnectionProviderFactory providerFactory;
    private final ImageProviderProperties properties;

    public List<NodeConnectionProfile> list(Long userId) {
        requireUser(userId);
        List<NodeConnectionProfile> profiles = new ArrayList<>(repository.list(userId));
        profiles.add(displayDeploymentProfile(DEPLOYMENT_COMFYUI));
        profiles.add(displayDeploymentProfile(DEPLOYMENT_SD));
        return List.copyOf(profiles);
    }

    public NodeConnectionProfile save(Long userId, String id, NodeConnectionRequest request) {
        requireUser(userId);
        if (id != null) {
            NodeConnectionProfile previous = requiredProfile(userId, id);
            if (previous.readOnly()) {
                throw invalid("部署连接只读，请另存为个人连接");
            }
        }
        String name = request.name() == null ? "" : request.name().trim();
        if (name.isEmpty() || name.length() > 80) {
            throw invalid("连接名称必须为 1 至 80 个字符");
        }
        NodeConnectionProfile profile = new NodeConnectionProfile(id == null ? UUID.randomUUID().toString() : id,
                name, provider(request.provider()), endpoint(request.baseUrl()), false);
        NodeConnectionProbe probe = discovery.probe(profile, null, null);
        if (!"usable".equals(probe.status())) {
            throw invalid("连接测试未通过，未保存修改：" + probe.message());
        }
        repository.save(userId, profile);
        return profile;
    }

    public NodeConnectionProbe probe(Long userId, String id, String checkpoint, String nodeType) {
        requireUser(userId);
        NodeConnectionProfile deployment = deploymentProfile(id);
        if (deployment != null && displayDeploymentProfile(id).baseUrl().isEmpty()) {
            return NodeConnectionProbe.unavailable("unconfigured", "部署连接地址不符合无凭据 URL 契约，请联系管理员修正");
        }
        NodeConnectionProfile profile = requiredProfile(userId, id);
        if (!deploymentEnabled(profile)) {
            return NodeConnectionProbe.unavailable("unconfigured", "部署连接尚未启用，请先由管理员配置或保存个人连接");
        }
        return discovery.probe(profile, checkpoint, nodeType(nodeType));
    }

    public NodeConnectionProbe probe(String provider, String baseUrl, String checkpoint, String nodeType) {
        if (baseUrl == null || baseUrl.isBlank()) {
            return NodeConnectionProbe.unavailable("unconfigured", "请先填写服务地址");
        }
        return discovery.probe(new NodeConnectionProfile("probe", "", provider(provider), endpoint(baseUrl), false),
                checkpoint, nodeType(nodeType));
    }

    public NodeConnectionValidationResponse validate(NodeConnectionValidationRequest request) {
        requireUser(request.userId());
        List<String> violations = new ArrayList<>();
        Map<String, NodeConnectionProfile> profiles = new HashMap<>();
        Map<String, NodeConnectionProbe> probes = new HashMap<>();
        Map<String, BusinessException> failures = new HashMap<>();
        long deadline = System.nanoTime() + java.time.Duration.ofSeconds(10).toNanos();
        for (NodeSelection selection : request.nodes() == null ? List.<NodeSelection>of() : request.nodes()) {
            if (selection == null || selection.connectionId() == null || selection.connectionId().isBlank()) {
                continue;
            }
            try {
                String id = selection.connectionId();
                if (failures.containsKey(id)) {
                    throw failures.get(id);
                }
                if (!profiles.containsKey(id)) {
                    try {
                        NodeConnectionProfile profile = checkedProfile(request.userId(), id);
                        if (System.nanoTime() >= deadline) {
                            throw invalid("连接校验时间预算已耗尽，请稍后重试");
                        }
                        // 同一请求中共享完整目录，逐节点独立校验所选模型，不跨请求缓存状态。
                        probes.put(id, discovery.probe(profile, null, null));
                        profiles.put(id, profile);
                    } catch (BusinessException exception) {
                        failures.put(id, exception);
                        throw exception;
                    }
                }
                validateSelection(profiles.get(id), selection, probes.get(id));
            } catch (BusinessException exception) {
                violations.add("节点 " + selection.nodeId() + "：" + exception.getMessage());
            }
        }
        return new NodeConnectionValidationResponse(List.copyOf(violations));
    }

    public ImageGenerationProvider resolveForExecution(Long userId, NodeSelection selection) {
        return providerFactory.create(validatedProfile(userId, selection));
    }

    private NodeConnectionProfile validatedProfile(Long userId, NodeSelection selection) {
        NodeConnectionProfile profile = checkedProfile(userId, selection.connectionId());
        validateSelection(profile, selection, discovery.probe(profile, null, null));
        return profile;
    }

    private NodeConnectionProfile checkedProfile(Long userId, String id) {
        NodeConnectionProfile profile = requiredProfile(userId, id);
        if (!deploymentEnabled(profile)) {
            throw invalid("所选部署连接尚未启用");
        }
        return profile;
    }

    private void validateSelection(NodeConnectionProfile profile, NodeSelection selection, NodeConnectionProbe probe) {
        String nodeType = nodeType(selection.nodeType());
        if (nodeType == null) {
            throw invalid("连接只支持图像生成和图像放大节点");
        }
        if (selection.provider() != null && !selection.provider().isBlank()
                && !profile.provider().equals(provider(selection.provider()))) {
            throw invalid("节点 Provider 与已保存连接不一致，请重新选择连接");
        }
        if (!"usable".equals(probe.status())) {
            throw invalid(probe.message());
        }
        if (!probe.capabilities().contains(nodeType)) {
            throw invalid("连接不支持所选节点类型");
        }
        if ("IMAGE_GENERATION".equals(nodeType)) {
            if (ImageProviderType.COMFYUI.name().equals(profile.provider()) && blank(selection.checkpoint())) {
                throw invalid("请为 ComfyUI 选择 Checkpoint");
            }
            requireCatalog(probe, "checkpoints");
            if (probe.models().checkpoints().isEmpty()) {
                throw invalid("服务未发现可用的 Checkpoint");
            }
            selected(probe, "checkpoints", selection.checkpoint(), probe.models().checkpoints());
            selected(probe, "vaes", selection.vae(), probe.models().vaes());
            selected(probe, "samplers", selection.sampler(), probe.models().samplers());
            selected(probe, "schedulers", selection.scheduler(), probe.models().schedulers());
            for (String lora : selection.loras() == null ? List.<String>of() : selection.loras()) {
                selected(probe, "loras", lora, probe.models().loras());
            }
        } else {
            requireCatalog(probe, "upscalers");
            if (probe.models().upscalers().isEmpty()) {
                throw invalid("服务未发现可用的放大方法");
            }
            String upscaler = selection.upscaler();
            if (blank(upscaler) && ImageProviderType.COMFYUI.name().equals(profile.provider())) {
                upscaler = "bilinear";
            }
            selected(probe, "upscalers", upscaler, probe.models().upscalers());
        }
    }

    private void selected(NodeConnectionProbe probe, String catalog, String selected, List<String> available) {
        if (blank(selected)) {
            return;
        }
        requireCatalog(probe, catalog);
        if (!available.contains(selected)) {
            throw invalid("所选 " + catalog + " 不在服务目录中：" + selected);
        }
    }

    private void requireCatalog(NodeConnectionProbe probe, String catalog) {
        if (probe.unavailableCatalogs().contains(catalog)) {
            throw invalid("无法验证 " + catalog + " 目录，请重试服务探测");
        }
    }

    private NodeConnectionProfile requiredProfile(Long userId, String id) {
        requireUser(userId);
        if (blank(id) || id.length() > 100) {
            throw invalid("节点连接 ID 无效");
        }
        NodeConnectionProfile deployment = deploymentProfile(id);
        NodeConnectionProfile profile = deployment == null ? repository.find(userId, id) : deployment;
        if (profile == null) {
            throw invalid("所选节点连接不存在，请重新选择或创建连接");
        }
        // 持久化记录与部署地址在使用前仍遵守同一 URL 契约。
        endpoint(profile.baseUrl());
        return profile;
    }

    private NodeConnectionProfile deploymentProfile(String id) {
        if (DEPLOYMENT_COMFYUI.equals(id)) {
            return new NodeConnectionProfile(id, "部署默认 ComfyUI", "COMFYUI", properties.getComfy().getBaseUrl(), true);
        }
        if (DEPLOYMENT_SD.equals(id)) {
            return new NodeConnectionProfile(id, "部署默认 Stable Diffusion WebUI", "STABLE_DIFFUSION_WEBUI",
                    properties.getStableDiffusion().getBaseUrl(), true);
        }
        return null;
    }

    private NodeConnectionProfile displayDeploymentProfile(String id) {
        NodeConnectionProfile profile = deploymentProfile(id);
        String displayUrl;
        try {
            displayUrl = endpoint(profile.baseUrl());
        } catch (BusinessException exception) {
            // 列表仅展示符合本期连接契约的地址，避免回显既有部署配置中的凭据。
            displayUrl = "";
        }
        return new NodeConnectionProfile(profile.id(), profile.name(), profile.provider(), displayUrl, true);
    }

    private boolean deploymentEnabled(NodeConnectionProfile profile) {
        return !profile.readOnly() || (DEPLOYMENT_COMFYUI.equals(profile.id())
                ? properties.getComfy().isEnabled() : properties.getStableDiffusion().isEnabled());
    }

    static String endpoint(String value) {
        if (value == null || value.isBlank() || value.length() > 2048) {
            throw invalid("服务地址必须是长度不超过 2048 的 HTTP(S) URL");
        }
        try {
            URI uri = new URI(value.trim());
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                    || uri.getRawFragment() != null || uri.getPort() > 65535 || uri.getPort() == 0) {
                throw invalid("服务地址必须为 HTTP(S)，且不能包含账号、密码、查询参数或片段");
            }
            String normalized = uri.toASCIIString();
            while (normalized.endsWith("/")) {
                normalized = normalized.substring(0, normalized.length() - 1);
            }
            return normalized;
        } catch (URISyntaxException exception) {
            throw invalid("服务地址格式无效");
        }
    }

    private static String provider(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if ("SD_WEBUI".equals(normalized) || "STABLE_DIFFUSION".equals(normalized)) {
            normalized = "STABLE_DIFFUSION_WEBUI";
        }
        try {
            return ImageProviderType.valueOf(normalized).name();
        } catch (IllegalArgumentException exception) {
            throw invalid("不支持的图像 Provider");
        }
    }

    private String nodeType(String value) {
        if (blank(value)) {
            return null;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!List.of("IMAGE_GENERATION", "UPSCALE").contains(normalized)) {
            throw invalid("连接只支持图像生成和图像放大节点");
        }
        return normalized;
    }

    private void requireUser(Long userId) {
        if (userId == null || userId <= 0) {
            throw invalid("节点连接需要有效用户");
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ResultCode.BAD_REQUEST, message);
    }
}
