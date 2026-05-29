package com.aetherflow.workflow.embedding;

public record TextChunk(
        String text,
        int chunkIndex,
        int startOffset,
        int endOffset
) {
}
