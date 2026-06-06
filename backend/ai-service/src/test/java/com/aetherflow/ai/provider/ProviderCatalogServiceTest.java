package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ProviderCatalogServiceTest {

    @Test
    void buildsFrontendCatalogWithProviderLabelsAndModelMetadata() {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultProvider(AiProviderType.OLLAMA);
        properties.setDefaultModel("qwen2.5:7b");
        ProviderCatalogService service = new ProviderCatalogService(properties, ProviderRuntimeCatalogClient.empty());
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));

        ProviderCatalogResponse catalog = service.catalog(policy);

        assertThat(catalog.providers())
                .extracting(ProviderCatalogResponse.ProviderCatalogProvider::endpointLabel)
                .containsExactly("OpenAI API", "Ollama Local Runtime");
        assertThat(catalog.models())
                .anySatisfy(model -> {
                    assertThat(model.provider()).isEqualTo(AiProviderType.OPENAI);
                    assertThat(model.contextWindowTokens()).isGreaterThan(0);
                    assertThat(model.pricing().source()).isEqualTo("backend-static-metadata");
                    assertThat(model.capabilities()).contains("chat", "summary");
                });
        assertThat(catalog.models())
                .filteredOn(model -> model.provider() == AiProviderType.OLLAMA)
                .isEmpty();
    }

    @Test
    void usesRuntimeOllamaModelsInsteadOfStaticFallbackCatalog() {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultProvider(AiProviderType.OLLAMA);
        properties.setDefaultModel("llama3");
        ProviderCatalogService service = new ProviderCatalogService(
                properties,
                () -> ProviderRuntimeCatalog.of(
                        List.of(AiProviderType.OLLAMA),
                        List.of(
                                new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "nomic-embed-text:latest"),
                                new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen3.5:9b"),
                                new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen3-coder:30b")
                        )
                )
        );
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));

        ProviderCatalogResponse catalog = service.catalog(policy);

        assertThat(catalog.providers())
                .extracting(ProviderCatalogResponse.ProviderCatalogProvider::provider)
                .containsExactly(AiProviderType.OLLAMA);
        assertThat(catalog.providers().get(0).defaultModel()).isEqualTo("qwen3.5:9b");
        assertThat(catalog.models())
                .extracting(ProviderCatalogResponse.ProviderCatalogModel::name)
                .containsExactly("qwen3.5:9b", "qwen3-coder:30b", "nomic-embed-text:latest")
                .doesNotContain("qwen2.5:7b");
        assertThat(catalog.models())
                .filteredOn(model -> model.name().equals("nomic-embed-text:latest"))
                .singleElement()
                .extracting(ProviderCatalogResponse.ProviderCatalogModel::kind)
                .isEqualTo("embedding");
    }

    @Test
    void usesRuntimeOpenAiCompatibleModelInsteadOfStaticFallbackCatalog() {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultProvider(AiProviderType.OLLAMA);
        properties.setDefaultModel("qwen3.5:9b");
        ProviderCatalogService service = new ProviderCatalogService(
                properties,
                () -> ProviderRuntimeCatalog.of(
                        List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA),
                        List.of(
                                new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OPENAI, "qwen/qwen3.5-9b"),
                                new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen3.5:9b")
                        )
                )
        );
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));

        ProviderCatalogResponse catalog = service.catalog(policy);

        assertThat(catalog.providers())
                .extracting(ProviderCatalogResponse.ProviderCatalogProvider::provider)
                .containsExactly(AiProviderType.OPENAI, AiProviderType.OLLAMA);
        assertThat(catalog.providers().get(0).defaultModel()).isEqualTo("qwen/qwen3.5-9b");
        assertThat(catalog.models())
                .filteredOn(model -> model.provider() == AiProviderType.OPENAI)
                .extracting(ProviderCatalogResponse.ProviderCatalogModel::name)
                .containsExactly("qwen/qwen3.5-9b")
                .doesNotContain("gpt-4o-mini");
    }

    @Test
    void omitsStaticOllamaFallbackModelWhenRuntimeCatalogIsEmpty() {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultProvider(AiProviderType.OLLAMA);
        properties.setDefaultModel("qwen3.5:9b");
        ProviderCatalogService service = new ProviderCatalogService(properties, ProviderRuntimeCatalogClient.empty());
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OLLAMA));

        ProviderCatalogResponse catalog = service.catalog(policy);

        assertThat(catalog.providers())
                .singleElement()
                .satisfies(provider -> {
                    assertThat(provider.provider()).isEqualTo(AiProviderType.OLLAMA);
                    assertThat(provider.defaultModel()).isBlank();
                });
        assertThat(catalog.models()).isEmpty();
    }
}
