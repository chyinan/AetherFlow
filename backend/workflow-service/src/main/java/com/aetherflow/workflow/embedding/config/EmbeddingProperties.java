package com.aetherflow.workflow.embedding.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@Data
@ConfigurationProperties(prefix = "aetherflow.workflow.embedding")
public class EmbeddingProperties {

    private String defaultProvider = "ollama";
    private String defaultModel = "nomic-embed-text";
    private int defaultChunkSize = 512;
    private int defaultOverlap = 128;
    private String defaultTextVariable = "ocrText";
    private String defaultVectorCollection = "workflow-embeddings";
    private String defaultVectorStoreProvider = "qdrant";
    private boolean inMemoryEnabled = true;
    private boolean knowledgeVectorIndexRequired = false;
    private String ollamaBaseUrl = "http://localhost:11434";
    private String qdrantBaseUrl = "https://qdrant.example.com";
    private String qdrantApiKey = "";
    private boolean qdrantEnabled = false;
    private Duration timeout = Duration.ofSeconds(30);
    private int threadPoolSize = 2;
    private int queueCapacity = 20;
}
