package com.aetherflow.workflow.embedding.store;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.TextChunk;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class MockVectorStore {

    private final ConcurrentMap<String, MockVectorRecord> records = new ConcurrentHashMap<>();

    public List<MockVectorRecord> saveAll(String workflowId,
                                          String nodeId,
                                          EmbeddingNodeConfig config,
                                          List<TextChunk> chunks,
                                          List<EmbeddingResult> results) {
        if (chunks.size() != results.size()) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "embedding chunk and vector count mismatch");
        }
        List<MockVectorRecord> saved = new ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            TextChunk chunk = chunks.get(index);
            EmbeddingResult result = results.get(index);
            String id = workflowId + ":" + nodeId + ":" + chunk.chunkIndex();
            MockVectorRecord record = new MockVectorRecord(
                    id,
                    config.vectorCollection(),
                    workflowId,
                    nodeId,
                    chunk.chunkIndex(),
                    chunk.text(),
                    result.vector(),
                    result.dimension(),
                    result.model(),
                    metadata(chunk)
            );
            records.put(id, record);
            saved.add(record);
        }
        return List.copyOf(saved);
    }

    public long count() {
        return records.size();
    }

    private Map<String, Object> metadata(TextChunk chunk) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("startOffset", chunk.startOffset());
        metadata.put("endOffset", chunk.endOffset());
        return metadata;
    }
}
