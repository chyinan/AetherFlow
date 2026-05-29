package com.aetherflow.workflow.embedding;

import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SimpleTextSplitterTest {

    private final SimpleTextSplitter splitter = new SimpleTextSplitter();

    @Test
    void splitsTextByChunkSizeAndOverlap() {
        List<TextChunk> chunks = splitter.split("abcdefghi", 5, 1);

        assertThat(chunks)
                .extracting(TextChunk::text)
                .containsExactly("abcde", "efghi");
        assertThat(chunks)
                .extracting(TextChunk::chunkIndex)
                .containsExactly(0, 1);
        assertThat(chunks)
                .extracting(TextChunk::startOffset)
                .containsExactly(0, 4);
        assertThat(chunks)
                .extracting(TextChunk::endOffset)
                .containsExactly(5, 9);
    }

    @Test
    void returnsNoChunksForBlankText() {
        assertThat(splitter.split(" \n\t", 512, 128)).isEmpty();
    }

    @Test
    void rejectsInvalidChunkSettings() {
        assertThatThrownBy(() -> splitter.split("abcdef", 0, 0))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("embedding chunkSize must be greater than 0");

        assertThatThrownBy(() -> splitter.split("abcdef", 4, 4))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("embedding overlap must be smaller than chunkSize");
    }
}
