package com.aetherflow.task.monitor;

public interface QueueMetricsClient {

    QueueMetrics fetch(String queueName);
}
