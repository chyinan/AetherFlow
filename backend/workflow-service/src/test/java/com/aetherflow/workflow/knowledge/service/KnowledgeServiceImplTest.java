package com.aetherflow.workflow.knowledge.service;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.SimpleTextSplitter;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DatasetCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDatasetSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDocumentSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;
import com.aetherflow.workflow.knowledge.entity.KnowledgeChunkEntity;
import com.aetherflow.workflow.knowledge.entity.KnowledgeDatasetEntity;
import com.aetherflow.workflow.knowledge.entity.KnowledgeDocumentEntity;
import com.aetherflow.workflow.knowledge.mapper.KnowledgeChunkMapper;
import com.aetherflow.workflow.knowledge.mapper.KnowledgeDatasetMapper;
import com.aetherflow.workflow.knowledge.mapper.KnowledgeDocumentMapper;
import com.aetherflow.workflow.knowledge.service.impl.KnowledgeServiceImpl;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KnowledgeServiceImplTest {

    @Mock
    private KnowledgeDatasetMapper datasetMapper;

    @Mock
    private KnowledgeDocumentMapper documentMapper;

    @Mock
    private KnowledgeChunkMapper chunkMapper;

    private KnowledgeServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new KnowledgeServiceImpl(
                datasetMapper,
                documentMapper,
                chunkMapper,
                new SimpleTextSplitter(),
                new ObjectMapper().findAndRegisterModules()
        );
    }

    @Test
    void createsDatasetWithFrontendDefaults() {
        DatasetCreateRequest request = new DatasetCreateRequest();
        request.setName("Product Docs RAG");
        request.setDescription("Public docs and release notes");
        request.setTags(List.of("docs", "hybrid"));
        doAnswer(invocation -> {
            KnowledgeDatasetEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            return 1;
        }).when(datasetMapper).insert(any(KnowledgeDatasetEntity.class));

        KnowledgeDatasetSummary response = asUser(7L, () -> service.createDataset(request));

        assertThat(response.id()).isEqualTo("11");
        assertThat(response.status()).isEqualTo("ready");
        assertThat(response.embeddingModel()).isEqualTo("nomic-embed-text");
        assertThat(response.tags()).containsExactly("docs", "hybrid");
        ArgumentCaptor<KnowledgeDatasetEntity> entityCaptor = ArgumentCaptor.forClass(KnowledgeDatasetEntity.class);
        verify(datasetMapper).insert(entityCaptor.capture());
        assertThat(entityCaptor.getValue().getOwnerUserId()).isEqualTo(7L);
        assertThat(entityCaptor.getValue().getTagsJson()).contains("hybrid");
    }

    @Test
    void createsDocumentChunksAndUpdatesDatasetCounters() {
        KnowledgeDatasetEntity dataset = dataset();
        when(datasetMapper.selectById(11L)).thenReturn(dataset);
        DocumentCreateRequest request = new DocumentCreateRequest();
        request.setSourceName("workflow-runbook.md");
        request.setContent("abcdefghi");
        request.setChunkSize(5);
        request.setOverlap(1);
        doAnswer(invocation -> {
            KnowledgeDocumentEntity entity = invocation.getArgument(0);
            entity.setId(21L);
            return 1;
        }).when(documentMapper).insert(any(KnowledgeDocumentEntity.class));

        KnowledgeDocumentSummary response = asUser(7L, () -> service.createDocument(11L, request));

        assertThat(response.id()).isEqualTo("21");
        assertThat(response.chunkCount()).isEqualTo(2);
        ArgumentCaptor<KnowledgeChunkEntity> chunkCaptor = ArgumentCaptor.forClass(KnowledgeChunkEntity.class);
        verify(chunkMapper, times(2)).insert(chunkCaptor.capture());
        assertThat(chunkCaptor.getAllValues()).extracting(KnowledgeChunkEntity::getPreview)
                .containsExactly("abcde", "efghi");
        verify(datasetMapper).updateById(dataset);
        assertThat(dataset.getDocumentCount()).isEqualTo(1);
        assertThat(dataset.getChunkCount()).isEqualTo(2);
    }

    @Test
    void listsDatasetsUsingPagedQuery() {
        Page<KnowledgeDatasetEntity> page = new Page<>(1, 20);
        page.setRecords(List.of(dataset()));
        page.setTotal(1);
        when(datasetMapper.selectPage(any(IPage.class), any())).thenReturn(page);

        PageResult<KnowledgeDatasetSummary> result = asUser(7L, () -> service.listDatasets("docs", "ready", 1, 20));

        assertThat(result.getTotal()).isEqualTo(1);
        assertThat(result.getRecords()).extracting(KnowledgeDatasetSummary::name)
                .containsExactly("Product Docs RAG");
    }

    @Test
    void runsRetrievalPreviewAgainstStoredChunks() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                chunk("workflow-runbook.md", "Workflow apps can combine LLM nodes.", 0.82D),
                chunk("billing.md", "Billing and quota handling guide.", 0.76D)
        ));
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("workflow");
        request.setTopK(3);

        RetrievalTestResponse response = asUser(7L, () -> service.runRetrievalTest(11L, request));

        assertThat(response.datasetId()).isEqualTo("11");
        assertThat(response.results()).hasSize(1);
        assertThat(response.results().get(0).source()).isEqualTo("workflow-runbook.md");
        assertThat(response.results().get(0).score()).isGreaterThan(0.82D);
    }

    @Test
    void deletesOwnedDatasetWithDocumentsAndChunks() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());

        asUser(7L, () -> {
            service.deleteDataset(11L);
            return null;
        });

        verify(chunkMapper).delete(any(Wrapper.class));
        verify(documentMapper).delete(any(Wrapper.class));
        verify(datasetMapper).deleteById(11L);
    }

    @Test
    void throwsNotFoundWhenDatasetIsMissing() {
        when(datasetMapper.selectById(404L)).thenReturn(null);

        assertThatThrownBy(() -> asUser(7L, () -> service.getDataset(404L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("knowledge dataset not found");
    }

    @Test
    void rejectsDatasetOwnedByAnotherUser() {
        KnowledgeDatasetEntity dataset = dataset();
        dataset.setOwnerUserId(99L);
        when(datasetMapper.selectById(11L)).thenReturn(dataset);

        assertThatThrownBy(() -> asUser(7L, () -> service.getDataset(11L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("knowledge dataset not found");
    }

    private static KnowledgeDatasetEntity dataset() {
        KnowledgeDatasetEntity dataset = new KnowledgeDatasetEntity();
        dataset.setId(11L);
        dataset.setName("Product Docs RAG");
        dataset.setDescription("Public docs and release notes");
        dataset.setStatus("ready");
        dataset.setDocumentCount(0);
        dataset.setProcessingDocumentCount(0);
        dataset.setChunkCount(0);
        dataset.setFailedChunkCount(0);
        dataset.setHitRate(92);
        dataset.setEmbeddingModel("nomic-embed-text");
        dataset.setRetrievalMode("hybrid search + rerank");
        dataset.setOwner("knowledge.ops");
        dataset.setOwnerUserId(7L);
        dataset.setTagsJson("[\"docs\"]");
        dataset.setUpdatedAt(LocalDateTime.parse("2026-05-29T10:00:00"));
        return dataset;
    }

    private static KnowledgeChunkEntity chunk(String source, String preview, Double score) {
        KnowledgeChunkEntity chunk = new KnowledgeChunkEntity();
        chunk.setId(31L);
        chunk.setDatasetId(11L);
        chunk.setDocumentId(21L);
        chunk.setSource(source);
        chunk.setPreview(preview);
        chunk.setTokens(146);
        chunk.setScore(score);
        chunk.setStatus("ready");
        return chunk;
    }

    private static <T> T asUser(Long userId, Supplier<T> action) {
        return AuthenticatedUserContext.runAs(userId, "aether.operator", action);
    }
}
