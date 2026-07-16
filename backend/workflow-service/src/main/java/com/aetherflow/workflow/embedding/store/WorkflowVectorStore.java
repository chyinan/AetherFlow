package com.aetherflow.workflow.embedding.store;

import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.TextChunk;

import java.util.List;

public interface WorkflowVectorStore {

    String providerName();

    List<MockVectorRecord> saveAll(String workflowId,
                                   String nodeId,
                                   EmbeddingNodeConfig config,
                                   List<TextChunk> chunks,
                                   List<EmbeddingResult> results);
}
