package com.aetherflow.workflow.embedding.provider;

import com.aetherflow.workflow.embedding.EmbeddingRequest;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import org.junit.jupiter.api.Test;
import org.springframework.ai.embedding.EmbeddingClient;
import org.springframework.ai.embedding.Embedding;
import org.springframework.ai.embedding.EmbeddingResponse;
import org.springframework.ai.ollama.api.OllamaOptions;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OllamaEmbeddingProviderTest {

    @Test
    void delegatesToSpringAiEmbeddingModelWithRequestedModel() throws Exception {
        EmbeddingClient embeddingClient = mock(EmbeddingClient.class);
        OllamaEmbeddingProvider provider = new OllamaEmbeddingProvider(embeddingClient);
        when(embeddingClient.call(argThat(request ->
                request != null
                        && request.getInstructions().equals(List.of("hello rag"))
                        && request.getOptions() instanceof OllamaOptions options
                        && "bge-m3".equals(options.getModel())
        ))).thenReturn(new EmbeddingResponse(List.of(new Embedding(List.of(0.1d, 0.2d, 0.3d), 0))));

        EmbeddingResult result = provider.embed(new EmbeddingRequest("hello rag", "bge-m3", 3, Map.of()));

        assertThat(provider.providerName()).isEqualTo("ollama");
        assertThat(result.model()).isEqualTo("bge-m3");
        assertThat(result.chunkIndex()).isEqualTo(3);
        assertThat(result.dimension()).isEqualTo(3);
        assertThat(result.vector()).containsExactly(0.1d, 0.2d, 0.3d);
    }
}
