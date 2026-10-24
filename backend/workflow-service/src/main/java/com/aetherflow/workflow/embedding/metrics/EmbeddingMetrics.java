package com.aetherflow.workflow.embedding.metrics;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class EmbeddingMetrics {

    private final AtomicLong embeddingCount = new AtomicLong();
    private final AtomicLong failCount = new AtomicLong();
    private final AtomicLong totalDurationMs = new AtomicLong();
    private final AtomicLong vectorCount = new AtomicLong();
    private final AtomicReference<String> currentModel = new AtomicReference<>("");
    private final AtomicLong orphanBatchCount = new AtomicLong();
    private final AtomicLong orphanChunkCount = new AtomicLong();

    public void recordSuccess(long durationMs, int producedVectors, String model) {
        embeddingCount.incrementAndGet();
        totalDurationMs.addAndGet(Math.max(durationMs, 0L));
        vectorCount.addAndGet(Math.max(producedVectors, 0));
        updateModel(model);
    }

    /**
     * 记录超时后被放弃的孤儿批次（后台 supplier 已经起步、无法真正打断）。
     */
    public void recordOrphanBatch(int abandonedChunks) {
        orphanBatchCount.incrementAndGet();
        orphanChunkCount.addAndGet(Math.max(abandonedChunks, 0));
    }

    public long orphanBatchCount() {
        return orphanBatchCount.get();
    }

    public long orphanChunkCount() {
        return orphanChunkCount.get();
    }

    public void recordFailure(long durationMs, String model) {
        embeddingCount.incrementAndGet();
        failCount.incrementAndGet();
        totalDurationMs.addAndGet(Math.max(durationMs, 0L));
        updateModel(model);
    }

    public EmbeddingMetricsSnapshot snapshot() {
        long count = embeddingCount.get();
        return new EmbeddingMetricsSnapshot(
                count,
                failCount.get(),
                count == 0L ? 0L : totalDurationMs.get() / count,
                vectorCount.get(),
                currentModel.get()
        );
    }

    private void updateModel(String model) {
        if (model != null && !model.isBlank()) {
            currentModel.set(model);
        }
    }
}
