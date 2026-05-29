package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingRequest;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.SimpleTextSplitter;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.embedding.metrics.EmbeddingMetrics;
import com.aetherflow.workflow.embedding.provider.EmbeddingProvider;
import com.aetherflow.workflow.embedding.provider.EmbeddingProviderRegistry;
import com.aetherflow.workflow.embedding.store.MockVectorStore;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmbeddingNodeExecutorTest {

    @Test
    void splitsTextEmbedsChunksStoresVectorsAndWritesWorkflowVariables() throws Exception {
        EmbeddingProvider provider = provider("ollama");
        EmbeddingMetrics embeddingMetrics = new EmbeddingMetrics();
        MockVectorStore vectorStore = new MockVectorStore();
        EmbeddingNodeExecutor executor = executor(provider, embeddingProperties(), embeddingMetrics, vectorStore, Runnable::run);
        when(provider.embed(argThat(request -> request != null
                && request.chunkIndex() == 0
                && "abcde".equals(request.text()))))
                .thenReturn(new EmbeddingResult(List.of(0.1d, 0.2d), 2, "nomic-embed-text", 0));
        when(provider.embed(argThat(request -> request != null
                && request.chunkIndex() == 1
                && "efghi".equals(request.text()))))
                .thenReturn(new EmbeddingResult(List.of(0.3d, 0.4d), 2, "nomic-embed-text", 1));

        NodeResult result = executor.execute(context(Map.of(
                "provider", "ollama",
                "model", "nomic-embed-text",
                "chunkSize", 5,
                "overlap", 1,
                "textVariable", "ocrText",
                "vectorCollection", "kb-docs"
        ), Map.of("ocrText", "abcdefghi")));

        assertThat(result.output()).containsEntry("provider", "ollama");
        assertThat(result.output()).containsEntry("model", "nomic-embed-text");
        assertThat(result.output()).containsEntry("chunkCount", 2);
        assertThat(result.variables()).containsEntry("embeddingVectorCount", 2);
        assertThat(result.variables()).containsEntry("embeddingModel", "nomic-embed-text");
        assertThat(result.variables()).containsEntry("embeddingProvider", "ollama");
        assertThat(result.variables().get("embeddingResults")).asList().hasSize(2);
        assertThat(result.variables().get("embeddingVectors")).asList().hasSize(2);
        assertThat(result.variables().get("embeddingVectorStore")).asList().hasSize(2);
        assertThat(vectorStore.count()).isEqualTo(2);
        assertThat(embeddingMetrics.snapshot().embeddingCount()).isEqualTo(1);
        assertThat(embeddingMetrics.snapshot().vectorCount()).isEqualTo(2);
        assertThat(embeddingMetrics.snapshot().currentModel()).isEqualTo("nomic-embed-text");
        verify(provider).embed(argThat(request -> request != null
                && "nomic-embed-text".equals(request.model())
                && request.chunkIndex() == 0));
        verify(provider).embed(argThat(request -> request != null
                && "nomic-embed-text".equals(request.model())
                && request.chunkIndex() == 1));
    }

    @Test
    void usesInlineTextFromConfigBeforeTextVariable() throws Exception {
        EmbeddingProvider provider = provider("ollama");
        EmbeddingNodeExecutor executor = executor(provider, embeddingProperties(), new EmbeddingMetrics(), new MockVectorStore(), Runnable::run);
        when(provider.embed(argThat(request -> request != null && "config text".equals(request.text()))))
                .thenReturn(new EmbeddingResult(List.of(0.1d), 1, "nomic-embed-text", 0));

        NodeResult result = executor.execute(context(Map.of("text", "config text"), Map.of("ocrText", "variable text")));

        assertThat(result.variables()).containsEntry("embeddingVectorCount", 1);
        verify(provider).embed(argThat(request -> request != null && "config text".equals(request.text())));
    }

    @Test
    void throwsOnEmbeddingTimeoutSoRuntimeRetryCanHandleIt() throws Exception {
        EmbeddingProvider provider = provider("ollama");
        EmbeddingProperties properties = embeddingProperties();
        properties.setTimeout(Duration.ofMillis(10));
        EmbeddingMetrics embeddingMetrics = new EmbeddingMetrics();
        ExecutorService executorService = Executors.newSingleThreadExecutor();
        EmbeddingNodeExecutor executor = executor(provider, properties, embeddingMetrics, new MockVectorStore(), executorService);
        when(provider.embed(argThat(request -> request != null && "abcdef".equals(request.text()))))
                .thenAnswer(invocation -> {
                    Thread.sleep(200);
                    return new EmbeddingResult(List.of(0.1d), 1, "nomic-embed-text", 0);
                });

        try {
            assertThatThrownBy(() -> executor.execute(context(Map.of(
                    "chunkSize", 512,
                    "overlap", 128
            ), Map.of("ocrText", "abcdef"))))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("embedding execution timed out");
            assertThat(embeddingMetrics.snapshot().embeddingCount()).isEqualTo(1);
            assertThat(embeddingMetrics.snapshot().failCount()).isEqualTo(1);
        } finally {
            executorService.shutdownNow();
        }
    }

    private static EmbeddingNodeExecutor executor(EmbeddingProvider provider,
                                                  EmbeddingProperties properties,
                                                  EmbeddingMetrics embeddingMetrics,
                                                  MockVectorStore vectorStore,
                                                  Executor taskExecutor) {
        return new EmbeddingNodeExecutor(
                new WorkflowNodeMetrics(),
                new EmbeddingProviderRegistry(List.of(provider)),
                new SimpleTextSplitter(),
                vectorStore,
                embeddingMetrics,
                properties,
                taskExecutor
        );
    }

    private static EmbeddingProvider provider(String name) throws Exception {
        EmbeddingProvider provider = mock(EmbeddingProvider.class);
        when(provider.providerName()).thenReturn(name);
        return provider;
    }

    private static EmbeddingProperties embeddingProperties() {
        EmbeddingProperties properties = new EmbeddingProperties();
        properties.setDefaultProvider("ollama");
        properties.setDefaultModel("nomic-embed-text");
        properties.setDefaultChunkSize(512);
        properties.setDefaultOverlap(128);
        properties.setDefaultTextVariable("ocrText");
        properties.setDefaultVectorCollection("workflow-embeddings");
        properties.setTimeout(Duration.ofSeconds(5));
        return properties;
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("embedding", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("embedding");
        return context;
    }
}
