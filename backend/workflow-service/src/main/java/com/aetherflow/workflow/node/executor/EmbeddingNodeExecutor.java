package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingRequest;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.TextChunk;
import com.aetherflow.workflow.embedding.TextSplitter;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.embedding.metrics.EmbeddingMetrics;
import com.aetherflow.workflow.embedding.provider.EmbeddingProvider;
import com.aetherflow.workflow.embedding.provider.EmbeddingProviderRegistry;
import com.aetherflow.workflow.embedding.store.MockVectorRecord;
import com.aetherflow.workflow.embedding.store.MockVectorStore;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Slf4j
@Component
public class EmbeddingNodeExecutor extends BaseNodeExecutor {

    private final EmbeddingProviderRegistry providerRegistry;
    private final TextSplitter textSplitter;
    private final MockVectorStore vectorStore;
    private final EmbeddingMetrics embeddingMetrics;
    private final EmbeddingProperties properties;
    private final Executor executor;

    public EmbeddingNodeExecutor(WorkflowNodeMetrics metrics,
                                 EmbeddingProviderRegistry providerRegistry,
                                 TextSplitter textSplitter,
                                 MockVectorStore vectorStore,
                                 EmbeddingMetrics embeddingMetrics,
                                 EmbeddingProperties properties,
                                 @Qualifier("embeddingTaskExecutor") Executor executor) {
        super(WorkflowNodeTypes.EMBEDDING, metrics);
        this.providerRegistry = providerRegistry;
        this.textSplitter = textSplitter;
        this.vectorStore = vectorStore;
        this.embeddingMetrics = embeddingMetrics;
        this.properties = properties;
        this.executor = executor;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) throws Exception {
        long start = System.nanoTime();
        EmbeddingNodeConfig embeddingConfig = EmbeddingNodeConfig.from(config, properties);
        try {
            String text = inputText(embeddingConfig, context);
            if (text.isBlank()) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "embedding node text is required");
            }
            List<TextChunk> chunks = textSplitter.split(text, embeddingConfig.chunkSize(), embeddingConfig.overlap());
            EmbeddingProvider provider = providerRegistry.select(embeddingConfig);
            List<EmbeddingResult> results = embedWithTimeout(provider, embeddingConfig, chunks);
            List<MockVectorRecord> records = vectorStore.saveAll(
                    context.workflowId(),
                    context.currentNodeId(),
                    embeddingConfig,
                    chunks,
                    results
            );
            embeddingMetrics.recordSuccess(elapsedMs(start), results.size(), embeddingConfig.model());
            log.info("embedding node completed, provider={}, model={}, chunkCount={}, vectorCount={}",
                    provider.providerName(), embeddingConfig.model(), chunks.size(), results.size());
            return buildResult(output(provider, embeddingConfig, chunks, results, records),
                    variables(provider, embeddingConfig, chunks, results, records));
        } catch (Exception exception) {
            embeddingMetrics.recordFailure(elapsedMs(start), embeddingConfig.model());
            throw exception;
        }
    }

    private List<EmbeddingResult> embedWithTimeout(EmbeddingProvider provider,
                                                   EmbeddingNodeConfig config,
                                                   List<TextChunk> chunks) throws Exception {
        CompletableFuture<List<EmbeddingResult>> future = CompletableFuture.supplyAsync(() -> {
            try {
                return embedChunks(provider, config, chunks);
            } catch (Exception exception) {
                throw new CompletionException(exception);
            }
        }, executor);
        try {
            return future.get(properties.getTimeout().toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            future.cancel(true);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "embedding execution timed out");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "embedding execution interrupted");
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof CompletionException completionException && completionException.getCause() != null) {
                cause = completionException.getCause();
            }
            if (cause instanceof Exception checked) {
                throw checked;
            }
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "embedding execution failed");
        }
    }

    private List<EmbeddingResult> embedChunks(EmbeddingProvider provider,
                                              EmbeddingNodeConfig config,
                                              List<TextChunk> chunks) throws Exception {
        List<EmbeddingResult> results = new ArrayList<>();
        for (TextChunk chunk : chunks) {
            results.add(provider.embed(new EmbeddingRequest(
                    chunk.text(),
                    config.model(),
                    chunk.chunkIndex(),
                    Map.of("startOffset", chunk.startOffset(), "endOffset", chunk.endOffset())
            )));
        }
        return List.copyOf(results);
    }

    private String inputText(EmbeddingNodeConfig config, WorkflowContext context) {
        if (!config.text().isBlank()) {
            return config.text();
        }
        Object value = context.variables().get(config.textVariable());
        if (value == null) {
            value = context.variables().get("ocrText");
        }
        if (value == null) {
            value = context.variables().get("text");
        }
        if (value == null) {
            value = context.variables().get("transcription");
        }
        if (value == null) {
            value = context.variables().get("summary");
        }
        return value == null ? "" : String.valueOf(value);
    }

    private Map<String, Object> output(EmbeddingProvider provider,
                                       EmbeddingNodeConfig config,
                                       List<TextChunk> chunks,
                                       List<EmbeddingResult> results,
                                       List<MockVectorRecord> records) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("provider", provider.providerName());
        output.put("model", config.model());
        output.put("chunkCount", chunks.size());
        output.put("vectorCount", results.size());
        output.put("chunks", chunks(chunks));
        output.put("embeddings", embeddings(results));
        output.put("vectorStore", vectorRecords(records));
        return output;
    }

    private Map<String, Object> variables(EmbeddingProvider provider,
                                          EmbeddingNodeConfig config,
                                          List<TextChunk> chunks,
                                          List<EmbeddingResult> results,
                                          List<MockVectorRecord> records) {
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("embeddingProvider", provider.providerName());
        variables.put("embeddingModel", config.model());
        variables.put("embeddingChunks", chunks(chunks));
        variables.put("embeddingResults", embeddings(results));
        variables.put("embeddingVectors", results.stream().map(EmbeddingResult::vector).toList());
        variables.put("embeddingVectorCount", results.size());
        variables.put("embeddingVectorStore", vectorRecords(records));
        return variables;
    }

    private List<Map<String, Object>> chunks(List<TextChunk> chunks) {
        return chunks.stream().map(chunk -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("chunkIndex", chunk.chunkIndex());
            map.put("text", chunk.text());
            map.put("startOffset", chunk.startOffset());
            map.put("endOffset", chunk.endOffset());
            return map;
        }).toList();
    }

    private List<Map<String, Object>> embeddings(List<EmbeddingResult> results) {
        return results.stream().map(result -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("chunkIndex", result.chunkIndex());
            map.put("model", result.model());
            map.put("dimension", result.dimension());
            map.put("vector", result.vector());
            return map;
        }).toList();
    }

    private List<Map<String, Object>> vectorRecords(List<MockVectorRecord> records) {
        return records.stream().map(record -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", record.id());
            map.put("collection", record.collection());
            map.put("workflowId", record.workflowId());
            map.put("nodeId", record.nodeId());
            map.put("chunkIndex", record.chunkIndex());
            map.put("dimension", record.dimension());
            map.put("model", record.model());
            return map;
        }).toList();
    }

    private long elapsedMs(long start) {
        return (System.nanoTime() - start) / 1_000_000L;
    }
}
