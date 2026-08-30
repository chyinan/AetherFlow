package com.aetherflow.workflow.knowledge.ingestion;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
// pattern: Imperative Shell
public class KnowledgeIngestionConfig {

    @Bean("knowledgeIngestionTaskExecutor")
    public Executor knowledgeIngestionTaskExecutor(KnowledgeIngestionProperties properties) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        int threads = Math.max(1, properties.getWorkerThreads());
        executor.setCorePoolSize(threads);
        executor.setMaxPoolSize(threads);
        executor.setQueueCapacity(Math.max(10, properties.getScanLimit() * 2));
        executor.setThreadNamePrefix("knowledge-ingestion-");
        executor.initialize();
        return executor;
    }
}
