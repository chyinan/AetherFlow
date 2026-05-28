package com.aetherflow.task.monitor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "RabbitMQ queue metrics snapshot.")
public class QueueMetrics {

    @Schema(description = "Queue name.", example = "aetherflow.ai.task.queue")
    private String queueName;

    @Schema(description = "Ready message count.", example = "120")
    private long readyMessages;

    @Schema(description = "Unacked message count.", example = "32")
    private long unackedMessages;

    @Schema(description = "Total message count.", example = "152")
    private long totalMessages;

    @Schema(description = "Consumer count.", example = "4")
    private int consumers;
}
