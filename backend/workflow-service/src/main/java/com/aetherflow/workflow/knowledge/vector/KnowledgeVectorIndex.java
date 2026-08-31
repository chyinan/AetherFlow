package com.aetherflow.workflow.knowledge.vector;

import com.aetherflow.workflow.knowledge.entity.KnowledgeChunkEntity;

import java.util.List;
import java.util.Map;

// pattern: Imperative Shell
public interface KnowledgeVectorIndex {

    boolean isAvailable();

    void upsert(KnowledgeChunkEntity chunk, List<Double> vector);

    List<Long> search(Long datasetId, List<Double> queryVector, int limit);

    default List<Long> search(Long datasetId,
                              List<Double> queryVector,
                              int limit,
                              Map<String, Object> metadataFilter) {
        return search(datasetId, queryVector, limit);
    }
}
