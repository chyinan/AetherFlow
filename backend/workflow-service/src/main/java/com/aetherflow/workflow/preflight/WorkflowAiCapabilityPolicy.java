package com.aetherflow.workflow.preflight;

import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// pattern: Functional Core
public final class WorkflowAiCapabilityPolicy {

    private WorkflowAiCapabilityPolicy() {
    }

    public static List<String> validate(WorkflowDefinitionDTO definition,
                                        AiWorkflowCapabilitiesDTO capabilities) {
        if (definition == null || definition.getNodes() == null || capabilities == null) {
            return List.of();
        }
        List<String> violations = new ArrayList<>();
        for (WorkflowNodeDTO node : definition.getNodes()) {
            validateNode(node, capabilities, violations);
        }
        return List.copyOf(violations);
    }

    public static boolean requiresRemoteCapabilities(WorkflowDefinitionDTO definition) {
        if (definition == null || definition.getNodes() == null) {
            return false;
        }
        return definition.getNodes().stream()
                .map(node -> normalize(node == null ? null : node.getNodeType()))
                .anyMatch(type -> requiredCapability(type) != null || requiresAsyncType(type));
    }

    public static List<String> validateAsyncRequirement(WorkflowDefinitionDTO definition) {
        if (definition == null || definition.getNodes() == null) return List.of();
        return definition.getNodes().stream()
                .filter(node -> node != null && requiresAsyncType(normalize(node.getNodeType())))
                .map(node -> prefix(node, normalize(node.getNodeType()))
                        + "requires WORKFLOW_AI_ASYNC_ENABLED=true for fenced artifact execution")
                .toList();
    }

    private static boolean requiresAsyncType(String type) {
        return switch (type) {
            case "WHISPER", "ASR", "FFMPEG", "IMAGE_GENERATION", "UPSCALE" -> true;
            default -> false;
        };
    }

    private static void validateNode(WorkflowNodeDTO node,
                                     AiWorkflowCapabilitiesDTO capabilities,
                                     List<String> violations) {
        String nodeType = normalize(node == null ? null : node.getNodeType());
        String requiredCapability = requiredCapability(nodeType);
        if (requiredCapability == null) {
            return;
        }
        if (!isExecutable(requiredCapability, capabilities)) {
            String reason = capabilities.unavailableReasons().getOrDefault(
                    requiredCapability,
                    requiredCapability.toLowerCase(Locale.ROOT) + " capability is unavailable"
            );
            violations.add(prefix(node, nodeType) + reason);
            return;
        }
        Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
        if ("LLM".equals(requiredCapability)) {
            validateSelectedProvider(node, nodeType, config.get("provider"), capabilities.llmProviders(), false, violations);
        } else if ("IMAGE_GENERATION".equals(requiredCapability) || "UPSCALE".equals(requiredCapability)) {
            validateSelectedProvider(node, nodeType, config.get("provider"), capabilities.imageProviders(), true, violations);
        }
    }

    private static boolean isExecutable(String requiredCapability,
                                        AiWorkflowCapabilitiesDTO capabilities) {
        if ("LLM".equals(requiredCapability)) {
            return capabilities.llmExecutable()
                    && capabilities.executableNodeTypes().contains(requiredCapability);
        }
        if ("WHISPER".equals(requiredCapability)) {
            return capabilities.whisperExecutable()
                    && capabilities.executableNodeTypes().contains(requiredCapability);
        }
        if ("IMAGE_GENERATION".equals(requiredCapability) || "UPSCALE".equals(requiredCapability)) {
            return !capabilities.imageProviders().isEmpty()
                    && capabilities.executableNodeTypes().contains(requiredCapability);
        }
        return capabilities.executableNodeTypes().contains(requiredCapability);
    }

    private static void validateSelectedProvider(WorkflowNodeDTO node,
                                                 String nodeType,
                                                 Object rawProvider,
                                                 List<String> availableProviders,
                                                 boolean imageProvider,
                                                 List<String> violations) {
        if (rawProvider == null || String.valueOf(rawProvider).isBlank()) {
            return;
        }
        String provider = normalizeProvider(String.valueOf(rawProvider), imageProvider);
        if (!availableProviders.contains(provider)) {
            String label = imageProvider ? "image provider " : "llm provider ";
            violations.add(prefix(node, nodeType) + label + provider + " is not enabled");
        }
    }

    private static String requiredCapability(String nodeType) {
        return switch (nodeType) {
            case "LLM", "SUMMARY", "TRANSLATE", "AGENT", "QUESTION_UNDERSTAND",
                    "QUESTION_CLASSIFIER", "PARAMETER_EXTRACTOR" -> "LLM";
            case "WHISPER" -> "WHISPER";
            case "IMAGE_GENERATION" -> "IMAGE_GENERATION";
            case "UPSCALE" -> "UPSCALE";
            default -> null;
        };
    }

    private static String normalizeProvider(String provider, boolean imageProvider) {
        String normalized = normalize(provider);
        if (imageProvider && ("SD_WEBUI".equals(normalized) || "STABLE_DIFFUSION".equals(normalized))) {
            return "STABLE_DIFFUSION_WEBUI";
        }
        return normalized;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace('-', '_');
    }

    private static String prefix(WorkflowNodeDTO node, String nodeType) {
        String nodeId = node == null || node.getNodeId() == null || node.getNodeId().isBlank()
                ? "unknown"
                : node.getNodeId().trim();
        return "node " + nodeId + " (" + nodeType + "): ";
    }
}
