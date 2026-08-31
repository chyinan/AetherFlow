package com.aetherflow.workflow.knowledge.vector;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.store.VectorStoreConfigService;
import com.aetherflow.workflow.knowledge.entity.KnowledgeChunkEntity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.net.http.HttpClient;

@Component
@RequiredArgsConstructor
// pattern: Imperative Shell
public class QdrantKnowledgeVectorIndex implements KnowledgeVectorIndex {

    private final VectorStoreConfigService configService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Override
    public boolean isAvailable() {
        return configService.currentConfig().enabled();
    }

    @Override
    public void upsert(KnowledgeChunkEntity chunk, List<Double> vector) {
        if (chunk == null || chunk.getId() == null || vector == null || vector.isEmpty()) {
            return;
        }
        VectorStoreConfigService.VectorStoreRuntimeConfig config = requiredConfig();
        ensureCollection(config, vector.size());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("chunkId", chunk.getId());
        payload.put("datasetId", chunk.getDatasetId());
        payload.put("documentId", chunk.getDocumentId());
        payload.put("parentChunkId", chunk.getParentChunkId());
        payload.put("chunkType", chunk.getChunkType());
        payload.put("status", chunk.getStatus());
        payload.put("source", chunk.getSource());
        payload.put("chunkIndex", chunk.getChunkIndex());
        payload.put("metadata", readMetadata(chunk.getMetadataJson()));

        Map<String, Object> point = new LinkedHashMap<>();
        point.put("id", UUID.nameUUIDFromBytes(("knowledge:" + chunk.getId()).getBytes(StandardCharsets.UTF_8)).toString());
        point.put("vector", vector);
        point.put("payload", payload);
        HttpResponse<String> response = send(config,
                "PUT",
                "/collections/" + path(knowledgeCollection(config)) + "/points?wait=true",
                Map.of("points", List.of(point)));
        requireSuccess(response, "qdrant knowledge vector upsert failed");
    }

    @Override
    public List<Long> search(Long datasetId, List<Double> queryVector, int limit) {
        return search(datasetId, queryVector, limit, Map.of());
    }

    @Override
    public List<Long> search(Long datasetId,
                             List<Double> queryVector,
                             int limit,
                             Map<String, Object> metadataFilter) {
        if (datasetId == null || queryVector == null || queryVector.isEmpty()) {
            return List.of();
        }
        VectorStoreConfigService.VectorStoreRuntimeConfig config = requiredConfig();
        List<Map<String, Object>> must = new ArrayList<>();
        must.add(Map.of("key", "datasetId", "match", Map.of("value", datasetId)));
        if (metadataFilter != null) {
            metadataFilter.forEach((key, value) -> {
                if (key != null && !key.isBlank()
                        && (value instanceof String || value instanceof Number || value instanceof Boolean)) {
                    must.add(Map.of("key", "metadata." + key, "match", Map.of("value", value)));
                }
            });
        }
        Map<String, Object> filter = Map.of("must", must);
        Map<String, Object> request = Map.of(
                "vector", queryVector,
                "limit", Math.max(1, Math.min(limit, 1000)),
                "with_payload", true,
                "filter", filter
        );
        HttpResponse<String> response = send(config,
                "POST",
                "/collections/" + path(knowledgeCollection(config)) + "/points/search",
                request);
        requireSuccess(response, "qdrant knowledge vector search failed");
        try {
            JsonNode results = objectMapper.readTree(response.body()).path("result");
            List<Long> ids = new ArrayList<>();
            if (results.isArray()) {
                for (JsonNode result : results) {
                    JsonNode chunkId = result.path("payload").path("chunkId");
                    if (chunkId.canConvertToLong()) {
                        ids.add(chunkId.longValue());
                    }
                }
            }
            return List.copyOf(ids);
        } catch (IOException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant knowledge vector response is invalid");
        }
    }

    private VectorStoreConfigService.VectorStoreRuntimeConfig requiredConfig() {
        VectorStoreConfigService.VectorStoreRuntimeConfig config = configService.currentConfig();
        if (!config.enabled()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant knowledge vector index is disabled");
        }
        return config;
    }

    private void ensureCollection(VectorStoreConfigService.VectorStoreRuntimeConfig config, int dimension) {
        HttpResponse<String> existing = send(config,
                "GET",
                "/collections/" + path(knowledgeCollection(config)),
                null);
        if (existing.statusCode() >= 200 && existing.statusCode() < 300) {
            return;
        }
        if (existing.statusCode() != 404) {
            requireSuccess(existing, "qdrant knowledge collection check failed");
        }
        Map<String, Object> body = Map.of("vectors", Map.of("size", dimension, "distance", "Cosine"));
        HttpResponse<String> created = send(config,
                "PUT",
                "/collections/" + path(knowledgeCollection(config)),
                body);
        if (created.statusCode() != 409) {
            requireSuccess(created, "qdrant knowledge collection create failed");
        }
    }

    private HttpResponse<String> send(VectorStoreConfigService.VectorStoreRuntimeConfig config,
                                      String method,
                                      String endpoint,
                                      Object body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + endpoint))
                    .timeout(Duration.ofSeconds(20));
            if (!config.apiKey().isBlank()) {
                builder.header("api-key", config.apiKey());
            }
            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", "application/json");
                builder.method(method, HttpRequest.BodyPublishers.ofString(
                        objectMapper.writeValueAsString(body), StandardCharsets.UTF_8));
            }
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant knowledge vector request failed");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant knowledge vector request interrupted");
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "qdrant knowledge vector request invalid");
        }
    }

    private void requireSuccess(HttpResponse<String> response, String message) {
        if (response == null || response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, message);
        }
    }

    private String path(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String knowledgeCollection(VectorStoreConfigService.VectorStoreRuntimeConfig config) {
        return config.collection() + "-knowledge";
    }

    private Map<String, Object> readMetadata(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            Map<?, ?> parsed = objectMapper.readValue(json, Map.class);
            Map<String, Object> result = new LinkedHashMap<>();
            if (parsed != null) {
                parsed.forEach((key, value) -> {
                    if (key != null && value != null) {
                        result.put(String.valueOf(key), value);
                    }
                });
            }
            return Map.copyOf(result);
        } catch (IOException exception) {
            return Map.of();
        }
    }
}
