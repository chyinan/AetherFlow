package com.aetherflow.workflow.preflight;

// pattern: Imperative Shell

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
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
        violations.addAll(WorkflowAiCapabilityPolicy.validate(definition, capabilities));
        if (nodeProperties != null && !nodeProperties.isAsyncAiEnabled()) {
            violations = new java.util.ArrayList<>(violations);
            violations.addAll(WorkflowAiCapabilityPolicy.validateAsyncRequirement(definition));
        }
        if (!violations.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "workflow AI capability preflight failed: " + String.join("; ", violations));
        }
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
