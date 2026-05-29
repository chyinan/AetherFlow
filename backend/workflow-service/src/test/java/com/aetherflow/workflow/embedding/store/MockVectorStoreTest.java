package com.aetherflow.workflow.embedding.store;

import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.TextChunk;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MockVectorStoreTest {

    @Test
    void storesChunkVectorsWithWorkflowAndNodeMetadata() {
        MockVectorStore store = new MockVectorStore();
        EmbeddingNodeConfig config = new EmbeddingNodeConfig(
                "ollama", "nomic-embed-text", 512, 128, "ocrText", "", "kb-docs");
        List<TextChunk> chunks = List.of(new TextChunk("hello", 0, 0, 5));
        List<EmbeddingResult> results = List.of(new EmbeddingResult(List.of(0.1d, 0.2d), 2, "nomic-embed-text", 0));

        List<MockVectorRecord> saved = store.saveAll("workflow-1", "embedding-1", config, chunks, results);

        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).id()).isEqualTo("workflow-1:embedding-1:0");
        assertThat(saved.get(0).collection()).isEqualTo("kb-docs");
        assertThat(saved.get(0).workflowId()).isEqualTo("workflow-1");
        assertThat(saved.get(0).nodeId()).isEqualTo("embedding-1");
        assertThat(saved.get(0).text()).isEqualTo("hello");
        assertThat(saved.get(0).dimension()).isEqualTo(2);
        assertThat(store.count()).isEqualTo(1);
    }
}
