package com.aetherflow.workflow.knowledge.service.impl;

// pattern: Functional Core

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.knowledge.KnowledgeDocumentLimits;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 知识文档入库前的纯文本归一化与分片参数校验。
 */
final class KnowledgeDocumentPreparation {

    private static final Pattern URL_PATTERN = Pattern.compile(
            "https?://[^\\s<>\"'，。；：！？、（）【】《》「」『』]+",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final String TRAILING_SENTENCE_PUNCTUATION =
            ".,;:!?，。；：！？、）】》」』";

    private KnowledgeDocumentPreparation() {
    }

    static String preprocessContent(String rawContent, boolean cleanSpaces, boolean cleanUrls) {
        String content = rawContent == null ? "" : rawContent;
        if (content.length() > KnowledgeDocumentLimits.MAX_DOCUMENT_CHARS) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge document content must not exceed 1000000 characters");
        }
        if (cleanSpaces) {
            content = content.replace("\r\n", "\n")
                    .replace('\r', '\n')
                    .replaceAll("[ \\t]+", " ")
                    .replaceAll(" *\\n *", "\n")
                    .replaceAll("\\n{3,}", "\n\n");
        }
        if (cleanUrls) {
            content = cleanUrls(content);
        }
        return content.strip();
    }

    static ChunkSettings resolveChunkSettings(Integer requestedChunkSize,
                                               Integer requestedOverlap,
                                               int defaultChunkSize,
                                               int defaultOverlap) {
        int chunkSize = requestedChunkSize == null ? defaultChunkSize : requestedChunkSize;
        int overlap = requestedOverlap == null ? defaultOverlap : requestedOverlap;
        if (chunkSize < KnowledgeDocumentLimits.MIN_CHUNK_SIZE
                || chunkSize > KnowledgeDocumentLimits.MAX_CHUNK_SIZE) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge document chunkSize must be between 64 and 16384");
        }
        if (overlap < 0 || overlap > KnowledgeDocumentLimits.MAX_OVERLAP) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge document overlap must be between 0 and 4096");
        }
        if (overlap >= chunkSize) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge document overlap must be smaller than chunkSize");
        }
        return new ChunkSettings(chunkSize, overlap);
    }

    static void validateProjectedChunkCount(String content,
                                            ChunkSettings settings,
                                            String delimiter,
                                            boolean parentChildMode) {
        long childCount = projectedChildChunkCount(content, settings, delimiter);
        long persistedCount = parentChildMode ? childCount + (childCount + 1L) / 2L : childCount;
        validateChunkCount(persistedCount);
    }

    static void validateChunkCount(long chunkCount) {
        if (chunkCount > KnowledgeDocumentLimits.MAX_CHUNK_COUNT) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge document chunk count must not exceed 2000");
        }
    }

    private static long projectedChildChunkCount(String content,
                                                 ChunkSettings settings,
                                                 String delimiter) {
        if (content == null || content.isBlank()) {
            return 0L;
        }
        String normalized = content.strip();
        String resolvedDelimiter = resolveDelimiter(delimiter);
        if (resolvedDelimiter == null) {
            return windowCount(normalized.length(), settings);
        }
        long count = 0L;
        int sectionStart = 0;
        while (sectionStart <= normalized.length()) {
            int delimiterIndex = normalized.indexOf(resolvedDelimiter, sectionStart);
            int sectionEnd = delimiterIndex < 0 ? normalized.length() : delimiterIndex;
            count += windowCount(strippedLength(normalized, sectionStart, sectionEnd), settings);
            if (count > KnowledgeDocumentLimits.MAX_CHUNK_COUNT || delimiterIndex < 0) {
                return count;
            }
            sectionStart = delimiterIndex + resolvedDelimiter.length();
        }
        return count;
    }

    private static long windowCount(int textLength, ChunkSettings settings) {
        if (textLength <= 0) {
            return 0L;
        }
        if (textLength <= settings.chunkSize()) {
            return 1L;
        }
        long remaining = textLength - (long) settings.chunkSize();
        long stride = settings.chunkSize() - (long) settings.overlap();
        return 1L + (remaining + stride - 1L) / stride;
    }

    private static int strippedLength(String value, int start, int end) {
        int strippedStart = start;
        while (strippedStart < end) {
            int codePoint = value.codePointAt(strippedStart);
            if (!Character.isWhitespace(codePoint)) {
                break;
            }
            strippedStart += Character.charCount(codePoint);
        }
        int strippedEnd = end;
        while (strippedEnd > strippedStart) {
            int codePoint = value.codePointBefore(strippedEnd);
            if (!Character.isWhitespace(codePoint)) {
                break;
            }
            strippedEnd -= Character.charCount(codePoint);
        }
        return strippedEnd - strippedStart;
    }

    private static String resolveDelimiter(String delimiter) {
        if (delimiter == null || delimiter.isBlank()) {
            return null;
        }
        String resolved = delimiter
                .replace("\\n", "\n")
                .replace("\\r", "\r")
                .replace("\\t", "\t");
        return resolved.isEmpty() ? null : resolved;
    }

    private static String cleanUrls(String content) {
        Matcher matcher = URL_PATTERN.matcher(content);
        StringBuffer result = new StringBuffer(content.length());
        while (matcher.find()) {
            String matched = matcher.group();
            int urlEnd = urlEnd(matched);
            String trailingPunctuation = matched.substring(urlEnd);
            matcher.appendReplacement(result, Matcher.quoteReplacement("[URL]" + trailingPunctuation));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    private static int urlEnd(String value) {
        int end = value.length();
        while (end > 0 && TRAILING_SENTENCE_PUNCTUATION.indexOf(value.charAt(end - 1)) >= 0) {
            end--;
        }
        end = trimUnbalancedClosing(value, end, '(', ')');
        end = trimUnbalancedClosing(value, end, '[', ']');
        return trimUnbalancedClosing(value, end, '{', '}');
    }

    private static int trimUnbalancedClosing(String value, int end, char opening, char closing) {
        while (end > 0 && value.charAt(end - 1) == closing
                && occurrences(value, end, closing) > occurrences(value, end, opening)) {
            end--;
        }
        return end;
    }

    private static int occurrences(String value, int end, char target) {
        int count = 0;
        for (int index = 0; index < end; index++) {
            if (value.charAt(index) == target) {
                count++;
            }
        }
        return count;
    }

    record ChunkSettings(int chunkSize, int overlap) {
    }
}
