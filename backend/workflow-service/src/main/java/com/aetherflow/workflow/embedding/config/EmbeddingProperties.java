package com.aetherflow.workflow.embedding.config;

// pattern: Functional Core

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
    /**
     * 仅当 Qdrant 位于受控 VPC/内网且管理员已显式配置时才允许私网地址。
     * 默认关闭，避免把该配置接口变成 SSRF 入口。
     */
    private boolean qdrantAllowPrivateNetworks = false;
    private Duration timeout = Duration.ofSeconds(30);
    private int threadPoolSize = 2;
    private int queueCapacity = 20;
}
