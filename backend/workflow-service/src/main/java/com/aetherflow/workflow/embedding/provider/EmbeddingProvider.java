package com.aetherflow.workflow.embedding.provider;

import com.aetherflow.workflow.embedding.EmbeddingRequest;
import com.aetherflow.workflow.embedding.EmbeddingResult;

public interface EmbeddingProvider {

    String providerName();

    EmbeddingResult embed(EmbeddingRequest request) throws Exception;
}
