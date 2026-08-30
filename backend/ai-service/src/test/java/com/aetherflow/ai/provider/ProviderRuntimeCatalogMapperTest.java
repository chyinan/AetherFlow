package com.aetherflow.ai.provider;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ProviderRuntimeCatalogMapperTest {

    @Test
    void mapsRuntimeReadinessAndModelsFromPythonStatus() {
        ProviderRuntimeCatalog catalog = ProviderRuntimeCatalogMapper.fromStatus(Map.of(
                "status", "UP",
                "providers", List.of("ollama", "openai"),
                "models", Map.of(
                        "ollama", List.of("qwen3:8b", "nomic-embed-text"),
                        "openai", List.of("gpt-4o-mini")
                ),
                "llmEnabled", true,
                "whisperEnabled", true,
                "whisperRuntimeReady", true,
                "ffmpegAvailable", true
        ));

        assertThat(catalog.runtimeReachable()).isTrue();
        assertThat(catalog.llmEnabled()).isTrue();
        assertThat(catalog.whisperEnabled()).isTrue();
        assertThat(catalog.whisperRuntimeReady()).isTrue();
        assertThat(catalog.ffmpegAvailable()).isTrue();
        assertThat(catalog.providers()).containsExactly(AiProviderType.OLLAMA, AiProviderType.OPENAI);
        assertThat(catalog.models())
                .extracting(ProviderRuntimeCatalog.RuntimeModel::name)
                .containsExactlyInAnyOrder("qwen3:8b", "nomic-embed-text", "gpt-4o-mini");
    }

    @Test
    void treatsMissingOrDownStatusAsUnavailable() {
        ProviderRuntimeCatalog catalog = ProviderRuntimeCatalogMapper.fromStatus(Map.of("status", "DOWN"));

        assertThat(catalog.runtimeReachable()).isFalse();
        assertThat(catalog.llmEnabled()).isFalse();
        assertThat(catalog.whisperEnabled()).isFalse();
        assertThat(catalog.providers()).isEmpty();
        assertThat(catalog.models()).isEmpty();
    }
}
