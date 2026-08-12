package com.aetherflow.workflow.knowledge.service;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.SimpleTextSplitter;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.provider.EmbeddingProvider;
import com.aetherflow.workflow.embedding.provider.EmbeddingProviderRegistry;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DatasetCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDatasetSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDocumentSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
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
import java.util.Map;
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
    void returnsTheExistingDatasetForARepeatedIdempotencyKey() {
        DatasetCreateRequest request = new DatasetCreateRequest();
        request.setName("Product Docs RAG");
        request.setIdempotencyKey("dataset-operation-1");
        KnowledgeDatasetEntity existing = dataset();
        when(datasetMapper.selectOne(any(Wrapper.class))).thenReturn(null, existing);
        doAnswer(invocation -> {
            KnowledgeDatasetEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            return 1;
        }).when(datasetMapper).insert(any(KnowledgeDatasetEntity.class));

        KnowledgeDatasetSummary first = asUser(7L, () -> service.createDataset(request));
        KnowledgeDatasetSummary second = asUser(7L, () -> service.createDataset(request));

        assertThat(first.id()).isEqualTo(second.id());
        verify(datasetMapper, times(1)).insert(any(KnowledgeDatasetEntity.class));
    }

    @Test
    void createsDocumentChunksAndUpdatesDatasetCounters() {
        KnowledgeDatasetEntity dataset = dataset();
        when(datasetMapper.selectById(11L)).thenReturn(dataset);
        DocumentCreateRequest request = new DocumentCreateRequest();
        request.setSourceName("workflow-runbook.md");
        request.setSourceType("input");
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
        assertThat(chunkCaptor.getAllValues().get(0).getMetadataJson()).contains("\"sourceType\":\"input\"");
        verify(datasetMapper).updateById(dataset);
        assertThat(dataset.getDocumentCount()).isEqualTo(1);
        assertThat(dataset.getChunkCount()).isEqualTo(2);
        assertThat(dataset.getHitRate()).isEqualTo(92);
    }

    @Test
    void returnsTheExistingDocumentForARepeatedIdempotencyKey() {
        KnowledgeDatasetEntity dataset = dataset();
        when(datasetMapper.selectById(11L)).thenReturn(dataset);
        DocumentCreateRequest request = new DocumentCreateRequest();
        request.setSourceName("workflow-runbook.md");
        request.setContent("abcdefghi");
        request.setIdempotencyKey("document-operation-1");
        KnowledgeDocumentEntity existing = new KnowledgeDocumentEntity();
        existing.setId(21L);
        existing.setDatasetId(11L);
        existing.setName("workflow-runbook.md");
        existing.setSourceType("file");
        existing.setMode("general");
        existing.setCharCount(9);
        existing.setChunkCount(1);
        existing.setRecallCount(0);
        existing.setStatus("ready");
        when(documentMapper.selectOne(any(Wrapper.class))).thenReturn(null, existing);
        doAnswer(invocation -> {
            KnowledgeDocumentEntity entity = invocation.getArgument(0);
            entity.setId(21L);
            return 1;
        }).when(documentMapper).insert(any(KnowledgeDocumentEntity.class));

        KnowledgeDocumentSummary first = asUser(7L, () -> service.createDocument(11L, request));
        KnowledgeDocumentSummary second = asUser(7L, () -> service.createDocument(11L, request));

        assertThat(first.id()).isEqualTo(second.id());
        verify(documentMapper, times(1)).insert(any(KnowledgeDocumentEntity.class));
    }

    @Test
    void createsParentAndChildChunksWhenParentChildModeIsSelected() {
        KnowledgeDatasetEntity dataset = dataset();
        when(datasetMapper.selectById(11L)).thenReturn(dataset);
        DocumentCreateRequest request = new DocumentCreateRequest();
        request.setSourceName("parent-child.md");
        request.setContent("abcdefghijklmno");
        request.setChunkSize(5);
        request.setOverlap(1);
        request.setMode("parentChild");
        doAnswer(invocation -> {
            KnowledgeDocumentEntity entity = invocation.getArgument(0);
            entity.setId(21L);
            return 1;
        }).when(documentMapper).insert(any(KnowledgeDocumentEntity.class));

        long[] nextChunkId = {31L};
        doAnswer(invocation -> {
            KnowledgeChunkEntity entity = invocation.getArgument(0);
            entity.setId(nextChunkId[0]++);
            return 1;
        }).when(chunkMapper).insert(any(KnowledgeChunkEntity.class));

        asUser(7L, () -> service.createDocument(11L, request));

        ArgumentCaptor<KnowledgeChunkEntity> chunkCaptor = ArgumentCaptor.forClass(KnowledgeChunkEntity.class);
        verify(chunkMapper, times(6)).insert(chunkCaptor.capture());
        assertThat(chunkCaptor.getAllValues()).extracting(KnowledgeChunkEntity::getChunkType)
                .containsExactly("parent", "child", "child", "parent", "child", "child");
        assertThat(chunkCaptor.getAllValues().get(1).getParentChunkId()).isEqualTo(31L);
        assertThat(chunkCaptor.getAllValues().get(2).getParentChunkId()).isEqualTo(31L);
        assertThat(chunkCaptor.getAllValues().get(4).getParentChunkId()).isEqualTo(34L);
        assertThat(chunkCaptor.getAllValues().get(5).getParentChunkId()).isEqualTo(34L);
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
    void rejectsBlankRetrievalQuery() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("  ");

        assertThatThrownBy(() -> asUser(7L, () -> service.runRetrievalTest(11L, request)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("retrieval query is required");
    }

    @Test
    void rejectsRetrievalTopKAboveTheSupportedLimit() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("pricing");
        request.setTopK(101);

        assertThatThrownBy(() -> asUser(7L, () -> service.runRetrievalTest(11L, request)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("topK must be between 1 and 50");
    }

    @Test
    void filtersRetrievalResultsByMetadataJson() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        KnowledgeChunkEntity inputChunk = chunk("input.md", "pricing policy", 0.0D);
        inputChunk.setMetadataJson("{\"sourceType\":\"input\"}");
        KnowledgeChunkEntity artifactChunk = chunk("artifact.md", "pricing policy", 0.0D);
        artifactChunk.setMetadataJson("{\"sourceType\":\"artifact\"}");
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(inputChunk, artifactChunk));
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("pricing");
        request.setMetadataFilter("{\"sourceType\":\"artifact\"}");

        RetrievalTestResponse response = asUser(7L, () -> service.runRetrievalTest(11L, request));

        assertThat(response.results()).extracting(result -> result.source()).containsExactly("artifact.md");
    }

    @Test
    void preservesNullValuesWhenListingChunkMetadata() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        KnowledgeChunkEntity chunk = chunk("input.md", "pricing policy", 0.0D);
        chunk.setMetadataJson("{\"sourceType\":null}");
        Page<KnowledgeChunkEntity> page = new Page<>(1, 100);
        page.setRecords(List.of(chunk));
        page.setTotal(1);
        when(chunkMapper.selectPage(any(IPage.class), any())).thenReturn(page);

        PageResult<KnowledgeChunkSummary> result = asUser(7L, () -> service.listDatasetChunks(11L, 1, 100));

        assertThat(result.getRecords()).hasSize(1);
        assertThat(result.getRecords().get(0).metadata()).containsEntry("sourceType", null);
    }

    @Test
    void createsAndUsesSemanticEmbeddingVectorsWhenDatasetRequestsEmbedding() {
        KnowledgeDatasetEntity dataset = dataset();
        dataset.setEmbeddingModel("nomic-embed-text");
        when(datasetMapper.selectById(11L)).thenReturn(dataset);
        DocumentCreateRequest request = new DocumentCreateRequest();
        request.setSourceName("semantic.md");
        request.setContent("cat facts");
        request.setChunkSize(64);
        doAnswer(invocation -> {
            KnowledgeDocumentEntity entity = invocation.getArgument(0);
            entity.setId(21L);
            return 1;
        }).when(documentMapper).insert(any(KnowledgeDocumentEntity.class));

        EmbeddingProvider provider = new EmbeddingProvider() {
            @Override
            public String providerName() {
                return "ollama";
            }

            @Override
            public EmbeddingResult embed(com.aetherflow.workflow.embedding.EmbeddingRequest embeddingRequest) {
                return new EmbeddingResult(
                        embeddingRequest.text().contains("cat") ? List.of(1.0D, 0.0D) : List.of(0.0D, 1.0D),
                        2,
                        embeddingRequest.model(),
                        embeddingRequest.chunkIndex()
                );
            }
        };
        KnowledgeServiceImpl semanticService = new KnowledgeServiceImpl(
                datasetMapper,
                documentMapper,
                chunkMapper,
                new SimpleTextSplitter(),
                new ObjectMapper().findAndRegisterModules(),
                new EmbeddingProviderRegistry(List.of(provider)),
                new EmbeddingProperties()
        );

        asUser(7L, () -> semanticService.createDocument(11L, request));

        ArgumentCaptor<KnowledgeChunkEntity> chunkCaptor = ArgumentCaptor.forClass(KnowledgeChunkEntity.class);
        verify(chunkMapper).insert(chunkCaptor.capture());
        assertThat(chunkCaptor.getValue().getVectorJson()).contains("1.0");
    }

    @Test
    void fallsBackToLexicalRetrievalForChunksWithoutVectors() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                chunk("workflow-runbook.md", "Workflow apps can combine LLM nodes.", 0.82D),
                chunk("billing.md", "Billing and quota handling guide.", 0.76D)
        ));

        EmbeddingProvider provider = new EmbeddingProvider() {
            @Override
            public String providerName() {
                return "ollama";
            }

            @Override
            public EmbeddingResult embed(com.aetherflow.workflow.embedding.EmbeddingRequest embeddingRequest) {
                return new EmbeddingResult(
                        List.of(1.0D, 0.0D),
                        2,
                        embeddingRequest.model(),
                        embeddingRequest.chunkIndex()
                );
            }
        };
        KnowledgeServiceImpl semanticService = new KnowledgeServiceImpl(
                datasetMapper,
                documentMapper,
                chunkMapper,
                new SimpleTextSplitter(),
                new ObjectMapper().findAndRegisterModules(),
                new EmbeddingProviderRegistry(List.of(provider)),
                new EmbeddingProperties()
        );
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("workflow");
        request.setTopK(3);

        RetrievalTestResponse response = asUser(7L, () -> semanticService.runRetrievalTest(11L, request));

        assertThat(response.results()).extracting(result -> result.source())
                .containsExactly("workflow-runbook.md");
    }

    @Test
    void excludesSemanticallyUnrelatedChunksWithCompatibleVectors() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        KnowledgeChunkEntity catChunk = chunk("cats.md", "feline facts", 0.0D);
        catChunk.setVectorJson("[1.0,0.0]");
        KnowledgeChunkEntity dogChunk = chunk("dogs.md", "canine facts", 0.0D);
        dogChunk.setVectorJson("[0.0,1.0]");
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(catChunk, dogChunk));

        EmbeddingProvider provider = new EmbeddingProvider() {
            @Override
            public String providerName() {
                return "ollama";
            }

            @Override
            public EmbeddingResult embed(com.aetherflow.workflow.embedding.EmbeddingRequest embeddingRequest) {
                return new EmbeddingResult(List.of(1.0D, 0.0D), 2, embeddingRequest.model(), embeddingRequest.chunkIndex());
            }
        };
        KnowledgeServiceImpl semanticService = new KnowledgeServiceImpl(
                datasetMapper,
                documentMapper,
                chunkMapper,
                new SimpleTextSplitter(),
                new ObjectMapper().findAndRegisterModules(),
                new EmbeddingProviderRegistry(List.of(provider)),
                new EmbeddingProperties()
        );
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("cat");
        request.setTopK(3);

        RetrievalTestResponse response = asUser(7L, () -> semanticService.runRetrievalTest(11L, request));

        assertThat(response.results()).extracting(result -> result.source()).containsExactly("cats.md");
    }

    @Test
    void doesNotApplyTheLexicalCandidateLimitToSemanticRetrieval() throws Exception {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        KnowledgeChunkEntity chunk = chunk("semantic.md", "semantic facts", 0.0D);
        chunk.setVectorJson("[1.0,0.0]");
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(chunk));

        EmbeddingProvider provider = new EmbeddingProvider() {
            @Override
            public String providerName() {
                return "ollama";
            }

            @Override
            public EmbeddingResult embed(com.aetherflow.workflow.embedding.EmbeddingRequest embeddingRequest) {
                return new EmbeddingResult(List.of(1.0D, 0.0D), 2, embeddingRequest.model(), embeddingRequest.chunkIndex());
            }
        };
        KnowledgeServiceImpl semanticService = new KnowledgeServiceImpl(
                datasetMapper,
                documentMapper,
                chunkMapper,
                new SimpleTextSplitter(),
                new ObjectMapper().findAndRegisterModules(),
                new EmbeddingProviderRegistry(List.of(provider)),
                new EmbeddingProperties()
        );
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("semantic");

        asUser(7L, () -> semanticService.runRetrievalTest(11L, request));

        ArgumentCaptor<Wrapper<KnowledgeChunkEntity>> wrapperCaptor = ArgumentCaptor.forClass(Wrapper.class);
        verify(chunkMapper).selectList(wrapperCaptor.capture());
        String wrapperDescription = wrapperCaptor.getValue().toString();
        assertThat(wrapperDescription).doesNotContain("LIMIT 2000");
    }

    @Test
    void doesNotReturnUnrelatedChunksWhenQueryHasNoMatch() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                chunk("workflow-runbook.md", "Workflow apps can combine LLM nodes.", 0.82D),
                chunk("billing.md", "Billing and quota handling guide.", 0.76D)
        ));
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("unrelated security policy");
        request.setTopK(3);

        RetrievalTestResponse response = asUser(7L, () -> service.runRetrievalTest(11L, request));

        assertThat(response.results()).isEmpty();
    }

    @Test
    void doesNotReturnChunksThatAreNotReady() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        KnowledgeChunkEntity failedChunk = chunk("failed.md", "pricing policy", 0.0D);
        failedChunk.setStatus("failed");
        KnowledgeChunkEntity readyChunk = chunk("ready.md", "pricing policy", 0.0D);
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(failedChunk, readyChunk));
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("pricing");

        RetrievalTestResponse response = asUser(7L, () -> service.runRetrievalTest(11L, request));

        assertThat(response.results()).extracting(result -> result.source()).containsExactly("ready.md");
    }

    @Test
    void ranksChunksByQueryTokenOverlapBeforeStoredScore() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                chunk("approval.md", "Workflow approval requires a reviewer.", 0.20D),
                chunk("workflow-runbook.md", "Workflow apps can combine LLM nodes.", 0.95D)
        ));
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("workflow approval");
        request.setTopK(3);

        RetrievalTestResponse response = asUser(7L, () -> service.runRetrievalTest(11L, request));

        assertThat(response.results()).extracting(result -> result.source())
                .containsExactly("approval.md", "workflow-runbook.md");
        assertThat(response.results().get(0).score())
                .isGreaterThan(response.results().get(1).score())
                .isLessThanOrEqualTo(1.0D);
    }

    @Test
    void usesChineseBigramsInsteadOfSingleCharacterMatches() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                chunk("policy.md", "价格政策", 0.0D),
                chunk("value.md", "价值观", 0.95D)
        ));
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("价格政策");
        request.setTopK(3);

        RetrievalTestResponse response = asUser(7L, () -> service.runRetrievalTest(11L, request));

        assertThat(response.results()).extracting(result -> result.source())
                .containsExactly("policy.md");
    }

    @Test
    void ignoresParentContextFromAnotherDocument() {
        when(datasetMapper.selectById(11L)).thenReturn(dataset());
        KnowledgeChunkEntity child = chunk("child.md", "specific pricing", 0.0D);
        child.setChunkType("child");
        child.setParentChunkId(99L);
        KnowledgeChunkEntity unrelatedParent = chunk("other.md", "unrelated context", 0.95D);
        unrelatedParent.setId(99L);
        unrelatedParent.setDocumentId(22L);
        unrelatedParent.setChunkType("parent");
        when(chunkMapper.selectList(any(Wrapper.class))).thenReturn(List.of(child));
        when(chunkMapper.selectBatchIds(any())).thenReturn(List.of(unrelatedParent));
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("pricing");

        RetrievalTestResponse response = asUser(7L, () -> service.runRetrievalTest(11L, request));

        assertThat(response.results().get(0).preview()).isEqualTo("specific pricing");
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
        chunk.setId((long) Math.abs(source.hashCode()));
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
