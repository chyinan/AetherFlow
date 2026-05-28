package com.aetherflow.task.monitor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "Queue health and backpressure snapshot.")
public class QueueHealthSnapshot {

    @Schema(description = "Overall queue status.", example = "NORMAL")
    private QueueBusyStatus status = QueueBusyStatus.UNKNOWN;

    @Schema(description = "Whether task-service should reject new AI tasks.", example = "false")
    private boolean busy;

    @Schema(description = "Human-readable busy or unknown reason.")
    private String reason = "queue health not initialized";

    @Schema(description = "Aggregated ready messages.", example = "120")
    private long readyMessages;

    @Schema(description = "Aggregated unacked messages.", example = "32")
    private long unackedMessages;

    @Schema(description = "Aggregated queue depth.", example = "152")
    private long totalMessages;

    @Schema(description = "Aggregated consumer count.", example = "4")
    private int consumers;

    @Schema(description = "Rejected task count since service start or Redis counter creation.", example = "8")
    private long rejectedTaskCount;

    @Schema(description = "Last check time.")
    private OffsetDateTime checkedAt = OffsetDateTime.now();

    @Schema(description = "Per-queue metrics.")
    private List<QueueMetrics> queues = new ArrayList<>();

    public static QueueHealthSnapshot unknown(String reason, boolean busy) {
        QueueHealthSnapshot snapshot = new QueueHealthSnapshot();
        snapshot.setStatus(QueueBusyStatus.UNKNOWN);
        snapshot.setBusy(busy);
        snapshot.setReason(reason);
        return snapshot;
    }
}
