package com.aetherflow.workflow.embedding;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

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

    public List<TextChunk> split(String text, int chunkSize, int overlap, String delimiter) {
        validate(chunkSize, overlap);
        if (text == null || text.isBlank()) {
            return List.of();
        }
        String normalized = text.strip();
        if (delimiter == null || delimiter.isBlank()) {
            return split(normalized, chunkSize, overlap);
        }
        String resolvedDelimiter = delimiter
                .replace("\\n", "\n")
                .replace("\\r", "\r")
                .replace("\\t", "\t");
        if (resolvedDelimiter.isEmpty()) {
            return split(normalized, chunkSize, overlap);
        }
        List<TextChunk> chunks = new ArrayList<>();
        int offset = 0;
        int chunkIndex = 0;
        for (String section : normalized.split(Pattern.quote(resolvedDelimiter), -1)) {
            String trimmed = section.strip();
            if (!trimmed.isEmpty()) {
                for (TextChunk chunk : split(trimmed, chunkSize, overlap)) {
                    chunks.add(new TextChunk(chunk.text(), chunkIndex++, offset + chunk.startOffset(), offset + chunk.endOffset()));
                }
            }
            offset += section.length() + resolvedDelimiter.length();
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
