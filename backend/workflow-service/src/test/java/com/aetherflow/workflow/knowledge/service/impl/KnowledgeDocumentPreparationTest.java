package com.aetherflow.workflow.knowledge.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class KnowledgeDocumentPreparationTest {

    @Test
    void normalizesCrLfAndRemainsIdempotent() {
        String input = "第一段  \r\n\r\n\r\n  第二段";

        String normalized = KnowledgeDocumentPreparation.preprocessContent(input, true, false);
        String normalizedAgain = KnowledgeDocumentPreparation.preprocessContent(normalized, true, false);

        assertThat(normalized).isEqualTo("第一段\n\n第二段");
        assertThat(normalizedAgain).isEqualTo(normalized);
    }

    @Test
    void cleansCaseInsensitiveUrlsWithoutConsumingMarkdownOrSentencePunctuation() {
        String input = "参见 [文档](HTTPS://example.com/docs?q=1)，然后访问 (Http://example.org/a).";

        String normalized = KnowledgeDocumentPreparation.preprocessContent(input, false, true);

        assertThat(normalized).isEqualTo("参见 [文档]([URL])，然后访问 ([URL]).");
    }

    @Test
    void urlCleaningRemainsIdempotent() {
        String input = "Visit HTTP://example.com/docs, then continue.";

        String normalized = KnowledgeDocumentPreparation.preprocessContent(input, false, true);

        assertThat(KnowledgeDocumentPreparation.preprocessContent(normalized, false, true))
                .isEqualTo(normalized);
    }

    @Test
    void acceptsChunkSettingBoundaries() {
        assertThat(KnowledgeDocumentPreparation.resolveChunkSettings(64, 0, 1024, 50))
                .isEqualTo(new KnowledgeDocumentPreparation.ChunkSettings(64, 0));
        assertThat(KnowledgeDocumentPreparation.resolveChunkSettings(16_384, 4_096, 1024, 50))
                .isEqualTo(new KnowledgeDocumentPreparation.ChunkSettings(16_384, 4_096));
    }

    @Test
    void rejectsChunkSettingsOutsideResourceBoundaries() {
        assertBadRequest(() -> KnowledgeDocumentPreparation.resolveChunkSettings(63, 0, 1024, 50),
                "chunkSize must be between 64 and 16384");
        assertBadRequest(() -> KnowledgeDocumentPreparation.resolveChunkSettings(16_385, 0, 1024, 50),
                "chunkSize must be between 64 and 16384");
        assertBadRequest(() -> KnowledgeDocumentPreparation.resolveChunkSettings(8_192, 4_097, 1024, 50),
                "overlap must be between 0 and 4096");
    }

    @Test
    void rejectsDocumentAboveCharacterLimitBeforeNormalization() {
        String oversized = "a".repeat(1_000_001);

        assertBadRequest(() -> KnowledgeDocumentPreparation.preprocessContent(oversized, true, true),
                "content must not exceed 1000000 characters");
    }

    @Test
    void enforcesPersistedChunkCountBoundaryForGeneralAndParentChildModes() {
        KnowledgeDocumentPreparation.ChunkSettings settings =
                new KnowledgeDocumentPreparation.ChunkSettings(64, 63);

        assertThatCode(() -> KnowledgeDocumentPreparation.validateProjectedChunkCount(
                "a".repeat(2_063), settings, null, false)).doesNotThrowAnyException();
        assertBadRequest(() -> KnowledgeDocumentPreparation.validateProjectedChunkCount(
                "a".repeat(2_064), settings, null, false), "chunk count must not exceed 2000");

        assertThatCode(() -> KnowledgeDocumentPreparation.validateProjectedChunkCount(
                "a".repeat(1_396), settings, null, true)).doesNotThrowAnyException();
        assertBadRequest(() -> KnowledgeDocumentPreparation.validateProjectedChunkCount(
                "a".repeat(1_397), settings, null, true), "chunk count must not exceed 2000");
    }

    @Test
    void rejectsDelimiterDrivenChunkExplosionBeforeSplitting() {
        KnowledgeDocumentPreparation.ChunkSettings settings =
                new KnowledgeDocumentPreparation.ChunkSettings(64, 0);
        String content = "a,".repeat(2_001);

        assertBadRequest(() -> KnowledgeDocumentPreparation.validateProjectedChunkCount(
                content, settings, ",", false), "chunk count must not exceed 2000");
    }

    private static void assertBadRequest(Runnable action, String message) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST))
                .hasMessageContaining(message);
    }
}
