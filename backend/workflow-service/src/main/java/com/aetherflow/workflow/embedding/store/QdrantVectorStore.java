package com.aetherflow.workflow.embedding.store;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.TextChunk;
import com.aetherflow.workflow.embedding.store.VectorStoreConfigService.VectorStoreRuntimeConfig;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class QdrantVectorStore implements WorkflowVectorStore {

    private final VectorStoreConfigService configService;
    private final ObjectMapper objectMapper;

    @Override
    public String providerName() {
        return "qdrant";
    }

    @Override
    public List<VectorRecord> saveAll(String workflowId,
                                          String nodeId,
                                          EmbeddingNodeConfig config,
                                          List<TextChunk> chunks,
                                          List<EmbeddingResult> results) {
        if (chunks.size() != results.size()) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "embedding chunk and vector count mismatch");
        }
        VectorStoreRuntimeConfig runtimeConfig = configService.currentConfig();
        if (!runtimeConfig.enabled()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "qdrant vector store is not enabled");
        }
        String collection = config.vectorCollection().isBlank() ? runtimeConfig.collection() : config.vectorCollection();
        ensureCollection(runtimeConfig, collection, firstDimension(results));
        upsert(runtimeConfig, collection, workflowId, nodeId, config, chunks, results);
        return records(collection, workflowId, nodeId, config, chunks, results);
    }

    private void ensureCollection(VectorStoreRuntimeConfig config, String collection, int dimension) {
        HttpResponse<String> getResponse = send(config, "GET", "/collections/" + path(collection), "");
        if (getResponse.statusCode() >= 200 && getResponse.statusCode() < 300) {
            return;
        }
        if (getResponse.statusCode() != 404) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant collection check failed");
        }
        Map<String, Object> body = Map.of(
                "vectors", Map.of(
                        "size", dimension,
                        "distance", "Cosine"
                )
        );
        HttpResponse<String> createResponse = send(config, "PUT", "/collections/" + path(collection), json(body));
        if (createResponse.statusCode() < 200 || createResponse.statusCode() >= 300) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant collection create failed");
        }
    }

    private void upsert(VectorStoreRuntimeConfig config,
                        String collection,
                        String workflowId,
                        String nodeId,
                        EmbeddingNodeConfig embeddingConfig,
                        List<TextChunk> chunks,
                        List<EmbeddingResult> results) {
        List<Map<String, Object>> points = new ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            TextChunk chunk = chunks.get(index);
            EmbeddingResult result = results.get(index);
            String id = recordId(workflowId, nodeId, chunk.chunkIndex());
            points.add(Map.of(
                    "id", UUID.nameUUIDFromBytes(id.getBytes(StandardCharsets.UTF_8)).toString(),
                    "vector", result.vector(),
                    "payload", payload(id, workflowId, nodeId, embeddingConfig, chunk, result)
            ));
        }
        HttpResponse<String> response = send(config, "PUT", "/collections/" + path(collection) + "/points?wait=true",
                json(Map.of("points", points)));
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant vector upsert failed");
        }
    }

    private Map<String, Object> payload(String id,
                                        String workflowId,
                                        String nodeId,
                                        EmbeddingNodeConfig config,
                                        TextChunk chunk,
                                        EmbeddingResult result) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", id);
        payload.put("workflowId", workflowId);
        payload.put("nodeId", nodeId);
        payload.put("chunkIndex", chunk.chunkIndex());
        payload.put("text", chunk.text());
        payload.put("startOffset", chunk.startOffset());
        payload.put("endOffset", chunk.endOffset());
        payload.put("model", result.model());
        payload.put("dimension", result.dimension());
        payload.put("collection", config.vectorCollection());
        return payload;
    }

    private List<VectorRecord> records(String collection,
                                           String workflowId,
                                           String nodeId,
                                           EmbeddingNodeConfig config,
                                           List<TextChunk> chunks,
                                           List<EmbeddingResult> results) {
        List<VectorRecord> saved = new ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            TextChunk chunk = chunks.get(index);
            EmbeddingResult result = results.get(index);
            saved.add(new VectorRecord(
                    recordId(workflowId, nodeId, chunk.chunkIndex()),
                    collection,
                    workflowId,
                    nodeId,
                    chunk.chunkIndex(),
                    chunk.text(),
                    result.vector(),
                    result.dimension(),
                    result.model(),
                    Map.of("provider", providerName(), "startOffset", chunk.startOffset(), "endOffset", chunk.endOffset())
            ));
        }
        return List.copyOf(saved);
    }

    private HttpResponse<String> send(VectorStoreRuntimeConfig config, String method, String path, String body) {
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                    .timeout(Duration.ofSeconds(20));
            if (!config.apiKey().isBlank()) {
                builder.header("api-key", config.apiKey());
            }
            if (body == null || body.isBlank()) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", "application/json");
                builder.method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            }
            return client.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant request failed");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant request interrupted");
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "qdrant payload serialization failed");
        }
    }

    private int firstDimension(List<EmbeddingResult> results) {
        if (results.isEmpty() || results.get(0).dimension() <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding vector dimension is required");
        }
        return results.get(0).dimension();
    }

    private String recordId(String workflowId, String nodeId, int chunkIndex) {
        return workflowId + ":" + nodeId + ":" + chunkIndex;
    }

    private String path(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
