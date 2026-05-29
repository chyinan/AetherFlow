package com.aetherflow.workflow.embedding;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmbeddingNodeConfigTest {

    @Test
    void readsProviderModelChunkSizeAndOverlapFromNodeConfig() {
        EmbeddingProperties properties = properties();

        EmbeddingNodeConfig config = EmbeddingNodeConfig.from(Map.of(
                "provider", "ollama",
                "model", "bge-m3",
                "chunkSize", 256,
                "overlap", 64,
                "textVariable", "ocrText",
                "vectorCollection", "kb-docs"
        ), properties);

        assertThat(config.provider()).isEqualTo("ollama");
        assertThat(config.model()).isEqualTo("bge-m3");
        assertThat(config.chunkSize()).isEqualTo(256);
        assertThat(config.overlap()).isEqualTo(64);
        assertThat(config.textVariable()).isEqualTo("ocrText");
        assertThat(config.vectorCollection()).isEqualTo("kb-docs");
    }

    @Test
    void usesEnterpriseDefaultsWhenNodeConfigIsEmpty() {
        EmbeddingNodeConfig config = EmbeddingNodeConfig.from(Map.of(), properties());

        assertThat(config.provider()).isEqualTo("ollama");
        assertThat(config.model()).isEqualTo("nomic-embed-text");
        assertThat(config.chunkSize()).isEqualTo(512);
        assertThat(config.overlap()).isEqualTo(128);
        assertThat(config.textVariable()).isEqualTo("ocrText");
        assertThat(config.vectorCollection()).isEqualTo("workflow-embeddings");
    }

    @Test
    void rejectsOverlapThatWouldPreventForwardProgress() {
        assertThatThrownBy(() -> EmbeddingNodeConfig.from(Map.of(
                "chunkSize", 128,
                "overlap", 128
        ), properties()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("embedding overlap must be smaller than chunkSize");
    }

    private static EmbeddingProperties properties() {
        EmbeddingProperties properties = new EmbeddingProperties();
        properties.setDefaultProvider("ollama");
        properties.setDefaultModel("nomic-embed-text");
        properties.setDefaultChunkSize(512);
        properties.setDefaultOverlap(128);
        properties.setDefaultTextVariable("ocrText");
        properties.setDefaultVectorCollection("workflow-embeddings");
        return properties;
    }
}
