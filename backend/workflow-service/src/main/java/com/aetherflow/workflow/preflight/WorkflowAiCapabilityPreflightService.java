package com.aetherflow.workflow.preflight;

// pattern: Imperative Shell

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.NodeConnectionValidationRequest;
import com.aetherflow.common.dto.NodeConnectionValidationResponse;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.ocr.provider.OCRProviderRegistry;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.embedding.store.VectorStoreConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Locale;
import java.util.stream.Collectors;

// pattern: Imperative Shell
@Service
@RequiredArgsConstructor
public class WorkflowAiCapabilityPreflightService {

    private final AiWorkflowNodeClient aiClient;
    @Autowired(required = false)
    private WorkflowNodeProperties nodeProperties;

    @Autowired(required = false)
    private OCRProviderRegistry ocrProviderRegistry;

    @Autowired(required = false)
    private EmbeddingProperties embeddingProperties;

    @Autowired(required = false)
    private VectorStoreConfigService vectorStoreConfigService;

    public void validate(WorkflowDefinitionDTO definition) {
        validate(definition, null);
    }

    public void validate(WorkflowDefinitionDTO definition, Long userId) {
        List<String> localViolations = validateLocalCapabilities(definition);
        if (!WorkflowAiCapabilityPolicy.requiresRemoteCapabilities(definition)) {
            if (!localViolations.isEmpty()) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "workflow local capability preflight failed: " + String.join("; ", localViolations));
            }
            return;
        }
        AiWorkflowCapabilitiesDTO capabilities = loadCapabilities();
        List<String> violations = new java.util.ArrayList<>(localViolations);
        Set<String> validatedConnectionNodes = validateConnections(definition, userId, violations);
        violations.addAll(WorkflowAiCapabilityPolicy.validate(definition, capabilities, validatedConnectionNodes));
        if (nodeProperties != null && !nodeProperties.isAsyncAiEnabled()) {
            violations = new java.util.ArrayList<>(violations);
            violations.addAll(WorkflowAiCapabilityPolicy.validateAsyncRequirement(definition));
        }
        if (!violations.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "workflow AI capability preflight failed: " + String.join("; ", violations));
        }
    }

    private Set<String> validateConnections(WorkflowDefinitionDTO definition, Long userId, List<String> violations) {
        List<NodeConnectionValidationRequest.NodeSelection> nodes = definition.getNodes().stream()
                .filter(node -> node != null && node.getNodeType() != null
                        && Set.of("IMAGE_GENERATION", "UPSCALE").contains(node.getNodeType().toUpperCase(Locale.ROOT)))
                .filter(node -> node.getConfig() != null && !text(node.getConfig().get("connectionId")).isBlank())
                .map(node -> {
                    Map<String, Object> config = node.getConfig();
                    List<String> loras = config.get("lora") instanceof List<?> entries
                            ? entries.stream().filter(Map.class::isInstance)
                            .map(entry -> text(((Map<?, ?>) entry).get("name"))).filter(name -> !name.isBlank()).toList()
                            : List.of();
                    return new NodeConnectionValidationRequest.NodeSelection(node.getNodeId(), node.getNodeType(),
                            text(config.get("connectionId")), text(config.get("provider")),
                            text(config.get("checkpoint")), text(config.get("upscaler")),
                            text(config.get("vae")), text(config.get("sampler")), text(config.get("scheduler")), loras);
                }).toList();
        if (nodes.isEmpty()) return Set.of();
        try {
            Result<NodeConnectionValidationResponse> response = aiClient.validateConnections(
                    new NodeConnectionValidationRequest(userId, nodes));
            if (response == null || !response.isSuccess() || response.getData() == null) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "image connection preflight returned no usable result");
            }
            violations.addAll(response.getData().violations());
            return nodes.stream().map(NodeConnectionValidationRequest.NodeSelection::nodeId).collect(Collectors.toSet());
        } catch (BusinessException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "image connection preflight is unavailable");
        }
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private List<String> validateLocalCapabilities(WorkflowDefinitionDTO definition) {
        if (definition == null || definition.getNodes() == null) {
            return List.of();
        }
        List<String> violations = new java.util.ArrayList<>();
        if (ocrProviderRegistry != null) {
            definition.getNodes().stream()
                    .filter(node -> node != null && "OCR".equalsIgnoreCase(node.getNodeType()))
                    .forEach(node -> {
                        try {
                            ocrProviderRegistry.validateReady(node.getConfig());
                        } catch (BusinessException exception) {
                            violations.add("node " + node.getNodeId() + " (OCR): " + exception.getMessage());
                        }
                    });
        }
        definition.getNodes().stream()
                .filter(node -> node != null && "CODE".equalsIgnoreCase(node.getNodeType()))
                .forEach(node -> {
                    if (nodeProperties == null || !nodeProperties.isCodeExecutionEnabled()
                            || !nodeProperties.isCodeRuntimeIsolationConfirmed()) {
                        violations.add("node " + node.getNodeId()
                                + " (CODE): isolated code runtime is not enabled and confirmed");
                    }
                });
        definition.getNodes().stream()
                .filter(node -> node != null && "EMBEDDING".equalsIgnoreCase(node.getNodeType()))
                .forEach(node -> validateEmbedding(node, violations));
        return List.copyOf(violations);
    }

    private void validateEmbedding(com.aetherflow.common.dto.WorkflowNodeDTO node, List<String> violations) {
        if (embeddingProperties == null) {
            return;
        }
        EmbeddingNodeConfig config = EmbeddingNodeConfig.from(node.getConfig(), embeddingProperties);
        if (!"ollama".equalsIgnoreCase(config.provider())) {
            violations.add("node " + node.getNodeId() + " (EMBEDDING): only Ollama embedding provider is executable");
        }
        if ("memory".equalsIgnoreCase(config.vectorStoreProvider()) && !embeddingProperties.isInMemoryEnabled()) {
            violations.add("node " + node.getNodeId() + " (EMBEDDING): in-memory vector store is disabled");
        }
        if ("qdrant".equalsIgnoreCase(config.vectorStoreProvider())
                && (!embeddingProperties.isQdrantEnabled()
                || embeddingProperties.getQdrantBaseUrl() == null
                || embeddingProperties.getQdrantBaseUrl().contains("example.com"))) {
            violations.add("node " + node.getNodeId() + " (EMBEDDING): Qdrant is not configured for production");
        } else if ("qdrant".equalsIgnoreCase(config.vectorStoreProvider()) && vectorStoreConfigService != null) {
            try {
                VectorStoreConfigService.VectorStoreRuntimeConfig runtimeConfig = vectorStoreConfigService.currentConfig();
                if (!runtimeConfig.enabled() || runtimeConfig.baseUrl() == null
                        || runtimeConfig.baseUrl().contains("example.com")) {
                    violations.add("node " + node.getNodeId() + " (EMBEDDING): persisted Qdrant configuration is not ready");
                }
            } catch (RuntimeException exception) {
                violations.add("node " + node.getNodeId() + " (EMBEDDING): persisted vector store configuration is unavailable");
            }
        }
    }

    private AiWorkflowCapabilitiesDTO loadCapabilities() {
        try {
            Result<AiWorkflowCapabilitiesDTO> result = aiClient.capabilities();
            if (result == null || !result.isSuccess() || result.getData() == null) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "workflow AI capability service returned no usable snapshot");
            }
            return result.getData();
        } catch (BusinessException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "workflow AI capability service is unavailable");
        }
    }
}
