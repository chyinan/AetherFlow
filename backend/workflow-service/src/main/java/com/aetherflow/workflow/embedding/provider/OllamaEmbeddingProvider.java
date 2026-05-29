package com.aetherflow.workflow.embedding.provider;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.EmbeddingRequest;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import org.springframework.ai.embedding.Embedding;
import org.springframework.ai.embedding.EmbeddingClient;
import org.springframework.ai.embedding.EmbeddingResponse;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class OllamaEmbeddingProvider implements EmbeddingProvider {

    private final EmbeddingClient embeddingClient;

    public OllamaEmbeddingProvider(EmbeddingClient embeddingClient) {
        this.embeddingClient = embeddingClient;
    }

    @Override
    public String providerName() {
        return "ollama";
    }

    @Override
    public EmbeddingResult embed(EmbeddingRequest request) {
        org.springframework.ai.embedding.EmbeddingRequest springRequest =
                new org.springframework.ai.embedding.EmbeddingRequest(
                        List.of(request.text()),
                        new OllamaOptions().withModel(request.model())
                );
        EmbeddingResponse response = embeddingClient.call(springRequest);
        Embedding embedding = response == null ? null : response.getResult();
        List<Double> vector = embedding == null ? List.of() : embedding.getOutput();
        if (vector == null || vector.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "ollama embedding returned empty vector");
        }
        return new EmbeddingResult(vector, vector.size(), request.model(), request.chunkIndex());
    }
}
