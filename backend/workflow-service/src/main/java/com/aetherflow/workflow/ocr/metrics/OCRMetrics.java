package com.aetherflow.workflow.ocr.metrics;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

@Component
public class OCRMetrics {

    private final AtomicLong ocrCount = new AtomicLong();
    private final AtomicLong failCount = new AtomicLong();
    private final AtomicLong totalDurationMs = new AtomicLong();

    public void recordSuccess(long durationMs) {
        ocrCount.incrementAndGet();
        totalDurationMs.addAndGet(Math.max(durationMs, 0L));
    }

    public void recordFailure(long durationMs) {
        ocrCount.incrementAndGet();
        failCount.incrementAndGet();
        totalDurationMs.addAndGet(Math.max(durationMs, 0L));
    }

    public OCRMetricsSnapshot snapshot() {
        long count = ocrCount.get();
        long totalDuration = totalDurationMs.get();
        return new OCRMetricsSnapshot(
                count,
                failCount.get(),
                count == 0L ? 0L : totalDuration / count
        );
    }
}
