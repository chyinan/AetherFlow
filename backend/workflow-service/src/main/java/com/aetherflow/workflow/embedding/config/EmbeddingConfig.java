package com.aetherflow.workflow.embedding.config;

import org.springframework.ai.embedding.EmbeddingClient;
import org.springframework.ai.ollama.OllamaEmbeddingClient;
import org.springframework.ai.ollama.api.OllamaApi;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableConfigurationProperties(EmbeddingProperties.class)
public class EmbeddingConfig {

    @Bean
    public OllamaApi workflowOllamaApi(EmbeddingProperties properties) {
        return new OllamaApi(properties.getOllamaBaseUrl());
    }

    @Bean
    public EmbeddingClient workflowOllamaEmbeddingClient(OllamaApi ollamaApi, EmbeddingProperties properties) {
        return new OllamaEmbeddingClient(ollamaApi)
                .withDefaultOptions(new OllamaOptions().withModel(properties.getDefaultModel()));
    }

    @Bean("embeddingTaskExecutor")
    @Qualifier("embeddingTaskExecutor")
    public Executor embeddingTaskExecutor(EmbeddingProperties properties) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("workflow-embedding-");
        executor.setCorePoolSize(properties.getThreadPoolSize());
        executor.setMaxPoolSize(properties.getThreadPoolSize());
        executor.setQueueCapacity(properties.getQueueCapacity());
        executor.initialize();
        return executor;
    }
}
