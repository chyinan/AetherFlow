package com.aetherflow.workflow.embedding;

import java.util.List;

public interface TextSplitter {

    List<TextChunk> split(String text, int chunkSize, int overlap);
}
