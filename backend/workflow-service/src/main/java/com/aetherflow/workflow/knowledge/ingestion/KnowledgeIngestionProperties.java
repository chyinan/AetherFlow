package com.aetherflow.workflow.knowledge.ingestion;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Data
@Component
@ConfigurationProperties(prefix = "aetherflow.workflow.knowledge.ingestion")
// pattern: Imperative Shell
public class KnowledgeIngestionProperties {

    private boolean enabled = true;
    private int workerThreads = 2;
    private int scanLimit = 20;
    private int maxAttempts = 3;
    private Duration retryDelay = Duration.ofMinutes(1);
    private Duration processingLeaseTimeout = Duration.ofHours(2);
    private long pollIntervalMillis = 2_000L;
}
