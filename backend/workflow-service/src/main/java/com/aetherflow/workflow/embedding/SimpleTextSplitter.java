package com.aetherflow.workflow.embedding;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class SimpleTextSplitter implements TextSplitter {

    @Override
    public List<TextChunk> split(String text, int chunkSize, int overlap) {
        validate(chunkSize, overlap);
        if (text == null || text.isBlank()) {
            return List.of();
        }
        String normalized = text.strip();
        List<TextChunk> chunks = new ArrayList<>();
        int start = 0;
        int chunkIndex = 0;
        while (start < normalized.length()) {
            int end = Math.min(start + chunkSize, normalized.length());
            chunks.add(new TextChunk(normalized.substring(start, end), chunkIndex, start, end));
            if (end >= normalized.length()) {
                break;
            }
            start = end - overlap;
            chunkIndex++;
        }
        return List.copyOf(chunks);
    }

    private void validate(int chunkSize, int overlap) {
        if (chunkSize <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding chunkSize must be greater than 0");
        }
        if (overlap < 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding overlap must be greater than or equal to 0");
        }
        if (overlap >= chunkSize) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "embedding overlap must be smaller than chunkSize");
        }
    }
}
