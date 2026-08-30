package com.aetherflow.ai.capability;

import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.provider.ProviderRuntimeCatalog;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiWorkflowCapabilityEvaluatorTest {

    @Test
    void reportsOnlyCurrentlyExecutableAiCapabilities() {
        ProviderRuntimeCatalog runtime = ProviderRuntimeCatalog.status(
                List.of(AiProviderType.OLLAMA),
                List.of(new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen3:8b")),
                true,
                true,
                true,
                true,
                true
        );

        AiWorkflowCapabilitiesDTO capabilities = AiWorkflowCapabilityEvaluator.evaluate(
                runtime,
                List.of("ASR", "LLM", "SUMMARY", "IMAGE_GENERATION", "UPSCALE"),
                List.of("COMFYUI")
        );

        assertThat(capabilities.runtimeReachable()).isTrue();
        assertThat(capabilities.llmExecutable()).isTrue();
        assertThat(capabilities.whisperExecutable()).isTrue();
        assertThat(capabilities.llmProviders()).containsExactly("OLLAMA");
        assertThat(capabilities.imageProviders()).containsExactly("COMFYUI");
        assertThat(capabilities.supportedNodeTypes())
                .containsExactly("IMAGE_GENERATION", "LLM", "SUMMARY", "UPSCALE", "WHISPER");
        assertThat(capabilities.executableNodeTypes())
                .containsExactly("IMAGE_GENERATION", "LLM", "SUMMARY", "UPSCALE", "WHISPER");
        assertThat(capabilities.unavailableReasons()).isEmpty();
    }

    @Test
    void explainsWhyConfiguredCodeIsNotExecutable() {
        AiWorkflowCapabilitiesDTO capabilities = AiWorkflowCapabilityEvaluator.evaluate(
                ProviderRuntimeCatalog.empty(),
                List.of("ASR", "LLM", "IMAGE_GENERATION"),
                List.of()
        );

        assertThat(capabilities.runtimeReachable()).isFalse();
        assertThat(capabilities.executableNodeTypes()).isEmpty();
        assertThat(capabilities.unavailableReasons())
                .containsKeys("WHISPER", "LLM", "IMAGE_GENERATION");
    }
}
