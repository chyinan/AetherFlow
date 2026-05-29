package com.aetherflow.workflow.embedding.provider;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EmbeddingProviderRegistryTest {

    @Test
    void selectsProviderByConfigWithoutExecutorKnowingConcreteProvider() {
        EmbeddingProvider ollama = provider("ollama");
        EmbeddingProvider openai = provider("openai");
        EmbeddingProviderRegistry registry = new EmbeddingProviderRegistry(List.of(ollama, openai));

        EmbeddingProvider selected = registry.select(config("openai"));

        assertThat(selected).isSameAs(openai);
    }

    @Test
    void throwsBusinessExceptionWhenProviderIsMissing() {
        EmbeddingProviderRegistry registry = new EmbeddingProviderRegistry(List.of(provider("ollama")));

        assertThatThrownBy(() -> registry.select(config("huggingface")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("embedding provider is not registered");
    }

    private static EmbeddingProvider provider(String name) {
        EmbeddingProvider provider = mock(EmbeddingProvider.class);
        when(provider.providerName()).thenReturn(name);
        return provider;
    }

    private static EmbeddingNodeConfig config(String provider) {
        return new EmbeddingNodeConfig(provider, "nomic-embed-text", 512, 128, "ocrText", "", "workflow-embeddings");
    }
}
