package com.aetherflow.workflow.knowledge;

// pattern: Functional Core

/**
 * 知识文档同步摄取链路的资源边界。
 */
public final class KnowledgeDocumentLimits {

    public static final int MIN_CHUNK_SIZE = 64;
    public static final int MAX_CHUNK_SIZE = 16_384;
    public static final int MAX_OVERLAP = 4_096;
    public static final int MAX_DOCUMENT_CHARS = 1_000_000;
    public static final int MAX_CHUNK_COUNT = 2_000;

    private KnowledgeDocumentLimits() {
    }
}
