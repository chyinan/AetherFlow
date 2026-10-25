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
                .containsExactly("OpenAI-compatible API", "Ollama Local Runtime");
        assertThat(catalog.providers().get(0).name()).isEqualTo("OpenAI-Compatible Gateway");
        assertThat(catalog.models())
                .anySatisfy(model -> {
                    assertThat(model.provider()).isEqualTo(AiProviderType.OPENAI);
                    assertThat(model.contextWindowTokens()).isGreaterThan(0);
                    assertThat(model.pricing().source()).isEqualTo("backend-static-metadata");
                    assertThat(model.pricing().inputUsdPerMillionTokens()).isNull();
                    assertThat(model.pricing().outputUsdPerMillionTokens()).isNull();
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
    void keepsCollidingModelNamesDistinctWithStableSuffix() {
        // qwen2.5:7b 与 qwen2-5:7b 的 slug 相同，旧实现会把两个模型压成同一个 id，
        // 前端按 id 选择时发生碰撞。这里要求 id 互不相同且仍可读。
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultProvider(AiProviderType.OLLAMA);
        properties.setDefaultModel("qwen2.5:7b");
        ProviderCatalogService service = new ProviderCatalogService(
                properties,
                () -> ProviderRuntimeCatalog.of(
                        List.of(AiProviderType.OLLAMA),
                        List.of(
                                new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen2.5:7b"),
                                new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen2-5:7b")
                        )
                )
        );
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OLLAMA));

        List<ProviderCatalogResponse.ProviderCatalogModel> models = service.catalog(policy).models();

        assertThat(models).hasSize(2);
        assertThat(models).extracting(ProviderCatalogResponse.ProviderCatalogModel::id)
                .doesNotHaveDuplicates()
                .allSatisfy(id -> assertThat(id).matches("model-ollama-qwen2-5-7b-[0-9a-f]{8}"));
        assertThat(models).extracting(ProviderCatalogResponse.ProviderCatalogModel::name)
                .containsExactlyInAnyOrder("qwen2.5:7b", "qwen2-5:7b");
    }

    @Test
    void keepsModelIdsStableAcrossCatalogRebuilds() {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultProvider(AiProviderType.OLLAMA);
        properties.setDefaultModel("llama3");
        ProviderRuntimeCatalog runtimeCatalog = ProviderRuntimeCatalog.of(
                List.of(AiProviderType.OLLAMA),
                List.of(
                        new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen2.5:7b"),
                        new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen2-5:7b"),
                        new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "nomic-embed-text:latest")
                )
        );
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OLLAMA));

        List<String> first = new ProviderCatalogService(properties, () -> runtimeCatalog)
                .catalog(policy).models().stream()
                .map(ProviderCatalogResponse.ProviderCatalogModel::id)
                .toList();
        List<String> second = new ProviderCatalogService(properties, () -> runtimeCatalog)
                .catalog(policy).models().stream()
                .map(ProviderCatalogResponse.ProviderCatalogModel::id)
                .toList();

        // id 不入库，但同一模型跨调用必须稳定，否则前端选中的模型会漂移。
        assertThat(first).isEqualTo(second);
        assertThat(first).doesNotHaveDuplicates();
        assertThat(first).allSatisfy(id -> assertThat(id).matches("[a-z0-9-]+"));
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
