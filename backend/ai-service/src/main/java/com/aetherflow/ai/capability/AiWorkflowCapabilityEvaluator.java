package com.aetherflow.ai.capability;

import com.aetherflow.ai.provider.ProviderRuntimeCatalog;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// pattern: Functional Core
public final class AiWorkflowCapabilityEvaluator {

    private static final List<String> LLM_NODE_TYPES = List.of("LLM", "SUMMARY", "TRANSLATE");
    private static final List<String> IMAGE_NODE_TYPES = List.of("IMAGE_GENERATION", "UPSCALE");

    private AiWorkflowCapabilityEvaluator() {
    }

    public static AiWorkflowCapabilitiesDTO evaluate(ProviderRuntimeCatalog runtime,
                                                     List<String> executorTypes,
                                                     List<String> imageProviders) {
        ProviderRuntimeCatalog safeRuntime = runtime == null ? ProviderRuntimeCatalog.empty() : runtime;
        List<String> supportedNodeTypes = normalizeExecutorTypes(executorTypes);
        List<String> normalizedImageProviders = stableNames(imageProviders);
        List<String> llmProviders = configuredLlmProviders(safeRuntime);
        boolean llmExecutable = safeRuntime.runtimeReachable()
                && safeRuntime.llmEnabled()
                && !llmProviders.isEmpty();
        boolean whisperExecutable = safeRuntime.runtimeReachable()
                && safeRuntime.whisperEnabled()
                && safeRuntime.whisperRuntimeReady()
                && safeRuntime.ffmpegAvailable();

        List<String> executableNodeTypes = supportedNodeTypes.stream()
                .filter(type -> executable(type, llmExecutable, whisperExecutable, normalizedImageProviders))
                .toList();
        Map<String, String> unavailableReasons = unavailableReasons(
                supportedNodeTypes,
                safeRuntime,
                llmExecutable,
                whisperExecutable,
                normalizedImageProviders
        );
        return new AiWorkflowCapabilitiesDTO(
                safeRuntime.runtimeReachable(),
                llmExecutable,
                whisperExecutable,
                llmProviders,
                normalizedImageProviders,
                supportedNodeTypes,
                executableNodeTypes,
                unavailableReasons
        );
    }

    private static boolean executable(String nodeType,
                                      boolean llmExecutable,
                                      boolean whisperExecutable,
                                      List<String> imageProviders) {
        if (LLM_NODE_TYPES.contains(nodeType)) {
            return llmExecutable;
        }
        if ("WHISPER".equals(nodeType)) {
            return whisperExecutable;
        }
        if (IMAGE_NODE_TYPES.contains(nodeType)) {
            return !imageProviders.isEmpty();
        }
        return true;
    }

    private static Map<String, String> unavailableReasons(List<String> supportedNodeTypes,
                                                           ProviderRuntimeCatalog runtime,
                                                           boolean llmExecutable,
                                                           boolean whisperExecutable,
                                                           List<String> imageProviders) {
        Map<String, String> reasons = new LinkedHashMap<>();
        if (!llmExecutable) {
            String reason = !runtime.runtimeReachable()
                    ? "python ai runtime is unavailable"
                    : !runtime.llmEnabled()
                    ? "llm runtime is disabled"
                    : "no configured chat model is available";
            LLM_NODE_TYPES.stream().filter(supportedNodeTypes::contains).forEach(type -> reasons.put(type, reason));
        }
        if (supportedNodeTypes.contains("WHISPER") && !whisperExecutable) {
            String reason = !runtime.runtimeReachable()
                    ? "python ai runtime is unavailable"
                    : !runtime.whisperEnabled()
                    ? "whisper runtime is disabled"
                    : !runtime.whisperRuntimeReady()
                    ? "whisper runtime is not ready"
                    : "ffmpeg is unavailable";
            reasons.put("WHISPER", reason);
        }
        if (imageProviders.isEmpty()) {
            IMAGE_NODE_TYPES.stream()
                    .filter(supportedNodeTypes::contains)
                    .forEach(type -> reasons.put(type, "no image generation provider is enabled"));
        }
        return Map.copyOf(reasons);
    }

    private static List<String> configuredLlmProviders(ProviderRuntimeCatalog runtime) {
        return runtime.models().stream()
                .filter(model -> isChatModel(model.name()))
                .map(model -> model.provider().name())
                .distinct()
                .sorted()
                .toList();
    }

    private static boolean isChatModel(String modelName) {
        String normalized = modelName == null ? "" : modelName.toLowerCase(Locale.ROOT);
        return !normalized.contains("embed") && !normalized.contains("whisper") && !normalized.contains("asr");
    }

    private static List<String> normalizeExecutorTypes(List<String> executorTypes) {
        return stableNames(executorTypes).stream()
                .map(type -> "ASR".equals(type) ? "WHISPER" : type)
                .distinct()
                .sorted()
                .toList();
    }

    private static List<String> stableNames(List<String> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(value -> normalizeName(value))
                .distinct()
                .sorted()
                .toList();
    }

    private static String normalizeName(String value) {
        String normalized = value.trim().toUpperCase(Locale.ROOT).replace('-', '_');
        return switch (normalized) {
            case "SD_WEBUI", "STABLE_DIFFUSION" -> "STABLE_DIFFUSION_WEBUI";
            default -> normalized;
        };
    }
}
