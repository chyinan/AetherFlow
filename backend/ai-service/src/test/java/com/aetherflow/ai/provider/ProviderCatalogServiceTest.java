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
        ProviderCatalogService service = new ProviderCatalogService(properties);
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
                })
                .anySatisfy(model -> {
                    assertThat(model.provider()).isEqualTo(AiProviderType.OLLAMA);
                    assertThat(model.name()).isEqualTo("qwen2.5:7b");
                    assertThat(model.pricing().priceHint()).contains("local");
                });
    }
}
