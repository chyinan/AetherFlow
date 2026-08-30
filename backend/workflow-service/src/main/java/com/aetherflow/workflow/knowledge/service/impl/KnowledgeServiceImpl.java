package com.aetherflow.workflow.knowledge.service.impl;

// pattern: Mixed (needs refactoring)
// 说明：历史实现同时包含持久化编排与检索排序；新增文档预处理逻辑已提取到 Functional Core。

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.SimpleTextSplitter;
import com.aetherflow.workflow.embedding.TextChunk;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingRequest;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.embedding.provider.EmbeddingProvider;
import com.aetherflow.workflow.embedding.provider.EmbeddingProviderRegistry;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DatasetCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
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
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class KnowledgeServiceImpl implements KnowledgeService {

    private static final String STATUS_READY = "ready";
    private static final String DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
    private static final String DEFAULT_RETRIEVAL_MODE = "hybrid search + rerank";
    private static final String DEFAULT_OWNER = "knowledge.ops";
    private static final String DEFAULT_SOURCE_TYPE = "file";
    private static final String DEFAULT_DOCUMENT_MODE = "general";
    private static final int DEFAULT_CHUNK_SIZE = 1024;
    private static final int DEFAULT_OVERLAP = 50;
    private static final int DEFAULT_PAGE = 1;
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int DEFAULT_CHUNK_PAGE_SIZE = 100;
    private static final int DEFAULT_TOP_K = 3;
    private static final int MAX_TOP_K = 50;
    private static final int MAX_RETRIEVAL_CANDIDATES = 2_000;
    private static final double MIN_SEMANTIC_SIMILARITY = 0.35D;
    private static final Pattern RETRIEVAL_TOKEN_PATTERN = Pattern.compile("[\\p{IsHan}]+|[\\p{L}\\p{N}]+");

    private final KnowledgeDatasetMapper datasetMapper;
    private final KnowledgeDocumentMapper documentMapper;
    private final KnowledgeChunkMapper chunkMapper;
    private final SimpleTextSplitter textSplitter;
    private final ObjectMapper objectMapper;
    private final EmbeddingProviderRegistry embeddingProviderRegistry;
    private final EmbeddingProperties embeddingProperties;

    @Autowired(required = false)
    private WorkflowDefinitionMapper workflowDefinitionMapper;

    public KnowledgeServiceImpl(KnowledgeDatasetMapper datasetMapper,
                                KnowledgeDocumentMapper documentMapper,
                                KnowledgeChunkMapper chunkMapper,
                                SimpleTextSplitter textSplitter,
                                ObjectMapper objectMapper) {
        this(datasetMapper, documentMapper, chunkMapper, textSplitter, objectMapper, null, new EmbeddingProperties());
    }

    @Autowired
    public KnowledgeServiceImpl(KnowledgeDatasetMapper datasetMapper,
                                KnowledgeDocumentMapper documentMapper,
                                KnowledgeChunkMapper chunkMapper,
                                SimpleTextSplitter textSplitter,
                                ObjectMapper objectMapper,
                                EmbeddingProviderRegistry embeddingProviderRegistry,
                                EmbeddingProperties embeddingProperties) {
        this.datasetMapper = datasetMapper;
        this.documentMapper = documentMapper;
        this.chunkMapper = chunkMapper;
        this.textSplitter = textSplitter;
        this.objectMapper = objectMapper;
        this.embeddingProviderRegistry = embeddingProviderRegistry;
        this.embeddingProperties = embeddingProperties;
    }

    @Override
    public PageResult<KnowledgeDatasetSummary> listDatasets(String query, String status, int page, int pageSize) {
        LambdaQueryWrapper<KnowledgeDatasetEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeDatasetEntity::getOwnerUserId, currentUserId());
        if (hasText(status)) {
            wrapper.eq(KnowledgeDatasetEntity::getStatus, status);
        }
        if (hasText(query)) {
            wrapper.and(nested -> nested.like(KnowledgeDatasetEntity::getName, query)
                    .or()
                    .like(KnowledgeDatasetEntity::getDescription, query)
                    .or()
                    .like(KnowledgeDatasetEntity::getTagsJson, query));
        }
        wrapper.orderByDesc(KnowledgeDatasetEntity::getUpdatedAt)
                .orderByDesc(KnowledgeDatasetEntity::getId);

        IPage<KnowledgeDatasetEntity> result = datasetMapper.selectPage(
                new Page<>(safePage(page), safePageSize(pageSize)), wrapper);
        return new PageResult<>(
                result.getCurrent(),
                result.getSize(),
                result.getTotal(),
                result.getRecords().stream().map(this::toDatasetSummary).toList()
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeDatasetSummary createDataset(DatasetCreateRequest request) {
        if (request == null || !hasText(request.getName())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge dataset name is required");
        }
        String idempotencyKey = normalizedIdempotencyKey(request.getIdempotencyKey());
        if (idempotencyKey != null) {
            KnowledgeDatasetEntity existing = datasetMapper.selectOne(new LambdaQueryWrapper<KnowledgeDatasetEntity>()
                    .eq(KnowledgeDatasetEntity::getOwnerUserId, currentUserId())
                    .eq(KnowledgeDatasetEntity::getIdempotencyKey, idempotencyKey)
                    .last("LIMIT 1"));
            if (existing != null) {
                return toDatasetSummary(existing);
            }
        }
        LocalDateTime now = LocalDateTime.now();
        KnowledgeDatasetEntity entity = new KnowledgeDatasetEntity();
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setStatus(STATUS_READY);
        entity.setDocumentCount(0);
        entity.setProcessingDocumentCount(0);
        entity.setChunkCount(0);
        entity.setFailedChunkCount(0);
        entity.setHitRate(0);
        entity.setEmbeddingModel(defaultText(request.getEmbeddingModel(), DEFAULT_EMBEDDING_MODEL));
        entity.setRetrievalMode(defaultText(request.getRetrievalMode(), DEFAULT_RETRIEVAL_MODE));
        entity.setOwnerUserId(currentUserId());
        entity.setIdempotencyKey(idempotencyKey);
        entity.setOwner(defaultText(request.getOwner(), currentUsername()));
        entity.setTagsJson(writeJson(request.getTags() == null ? List.of() : request.getTags()));
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        try {
            datasetMapper.insert(entity);
        } catch (DuplicateKeyException exception) {
            KnowledgeDatasetEntity existing = findDatasetByIdempotencyKey(idempotencyKey);
            if (existing != null) {
                return toDatasetSummary(existing);
            }
            throw exception;
        }
        return toDatasetSummary(entity);
    }

    @Override
    public KnowledgeDatasetSummary getDataset(Long datasetId) {
        return toDatasetSummary(requireDataset(datasetId));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDataset(Long datasetId) {
        requireDataset(datasetId);
        if (isDatasetReferencedByWorkflow(datasetId)) {
            throw new BusinessException(ResultCode.CONFLICT,
                    "knowledge dataset is still referenced by a workflow; update the workflow first");
        }
        chunkMapper.delete(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDatasetId, datasetId));
        documentMapper.delete(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                .eq(KnowledgeDocumentEntity::getDatasetId, datasetId));
        datasetMapper.deleteById(datasetId);
    }

    @Override
    public PageResult<KnowledgeDocumentSummary> listDocuments(Long datasetId, int page, int pageSize) {
        requireDataset(datasetId);
        LambdaQueryWrapper<KnowledgeDocumentEntity> wrapper = new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                .eq(KnowledgeDocumentEntity::getDatasetId, datasetId)
                .orderByDesc(KnowledgeDocumentEntity::getUploadedAt)
                .orderByDesc(KnowledgeDocumentEntity::getId);
        IPage<KnowledgeDocumentEntity> result = documentMapper.selectPage(
                new Page<>(safePage(page), safePageSize(pageSize)), wrapper);
        return new PageResult<>(
                result.getCurrent(),
                result.getSize(),
                result.getTotal(),
                result.getRecords().stream().map(this::toDocumentSummary).toList()
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeDocumentSummary createDocument(Long datasetId, DocumentCreateRequest request) {
        if (request == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge document request is required");
        }
        KnowledgeDatasetEntity dataset = requireDataset(datasetId);
        String idempotencyKey = normalizedIdempotencyKey(request.getIdempotencyKey());
        if (idempotencyKey != null) {
            KnowledgeDocumentEntity existing = documentMapper.selectOne(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                    .eq(KnowledgeDocumentEntity::getDatasetId, datasetId)
                    .eq(KnowledgeDocumentEntity::getIdempotencyKey, idempotencyKey)
                    .last("LIMIT 1"));
            if (existing != null) {
                return toDocumentSummary(existing);
            }
        }
        if (idempotencyKey == null && hasText(request.getFileId())) {
            KnowledgeDocumentEntity existing = documentMapper.selectOne(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                    .eq(KnowledgeDocumentEntity::getDatasetId, datasetId)
                    .eq(KnowledgeDocumentEntity::getFileId, request.getFileId().trim())
                    .ne(KnowledgeDocumentEntity::getStatus, "deleted")
                    .last("LIMIT 1"));
            if (existing != null) {
                return toDocumentSummary(existing);
            }
        }
        LocalDateTime now = LocalDateTime.now();
        String content = KnowledgeDocumentPreparation.preprocessContent(
                request.getContent(),
                Boolean.TRUE.equals(request.getCleanSpaces()),
                Boolean.TRUE.equals(request.getCleanUrls())
        );
        if (!hasText(content)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge document content is required");
        }
        KnowledgeDocumentPreparation.ChunkSettings chunkSettings = KnowledgeDocumentPreparation.resolveChunkSettings(
                request.getChunkSize(), request.getOverlap(), DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP);
        boolean parentChildMode = "parentChild".equalsIgnoreCase(
                defaultText(request.getMode(), DEFAULT_DOCUMENT_MODE));
        KnowledgeDocumentPreparation.validateProjectedChunkCount(
                content, chunkSettings, request.getDelimiter(), parentChildMode);
        List<TextChunk> chunks = textSplitter.split(
                content, chunkSettings.chunkSize(), chunkSettings.overlap(), request.getDelimiter());
        int persistedChunkCount = parentChildMode ? chunks.size() + (chunks.size() + 1) / 2 : chunks.size();
        KnowledgeDocumentPreparation.validateChunkCount(persistedChunkCount);
        String embeddingModel = defaultText(dataset.getEmbeddingModel(), DEFAULT_EMBEDDING_MODEL);
        List<EmbeddingResult> embeddings = semanticModel(embeddingModel)
                ? embedChunks(chunks, embeddingModel)
                : List.of();

        KnowledgeDocumentEntity document = new KnowledgeDocumentEntity();
        document.setDatasetId(datasetId);
        document.setIdempotencyKey(idempotencyKey);
        document.setName(defaultText(request.getSourceName(), "document-" + datasetId));
        document.setSourceType(defaultText(request.getSourceType(), DEFAULT_SOURCE_TYPE));
        document.setFileId(request.getFileId());
        document.setMode(defaultText(request.getMode(), DEFAULT_DOCUMENT_MODE));
        document.setCharCount(content.length());
        document.setChunkCount(persistedChunkCount);
        document.setRecallCount(0);
        document.setStatus(STATUS_READY);
        document.setUploadedAt(now);
        document.setCreatedAt(now);
        document.setUpdatedAt(now);
        try {
            documentMapper.insert(document);
        } catch (DuplicateKeyException exception) {
            KnowledgeDocumentEntity existing = findDocumentByIdempotencyKey(datasetId, idempotencyKey);
            if (existing != null) {
                return toDocumentSummary(existing);
            }
            throw exception;
        }

        if (parentChildMode) {
            insertParentChildChunks(datasetId, document, chunks, embeddings, request, now);
        } else {
            for (TextChunk textChunk : chunks) {
                insertChunk(datasetId, document, textChunk, embeddings, null, "general", chunkMetadata(request), now);
            }
        }

        dataset.setDocumentCount(nvl(dataset.getDocumentCount()) + 1);
        dataset.setProcessingDocumentCount(0);
        dataset.setChunkCount(nvl(dataset.getChunkCount()) + persistedChunkCount);
        dataset.setFailedChunkCount(nvl(dataset.getFailedChunkCount()));
        dataset.setStatus(STATUS_READY);
        dataset.setUpdatedAt(now);
        if (datasetMapper.incrementDocumentCounters(datasetId, persistedChunkCount, now) != 1) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR,
                    "knowledge dataset counter update failed");
        }

        return toDocumentSummary(document);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDocument(Long documentId) {
        KnowledgeDocumentEntity document = requireDocument(documentId);
        requireDataset(document.getDatasetId());
        int deletedChunks = nvl(document.getChunkCount());
        chunkMapper.delete(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDocumentId, documentId));
        documentMapper.deleteById(documentId);
        if (datasetMapper.decrementDocumentCounters(document.getDatasetId(), deletedChunks, LocalDateTime.now()) != 1) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "knowledge dataset counter update failed");
        }
    }

    @Override
    public List<KnowledgeChunkSummary> listDocumentChunks(Long documentId) {
        KnowledgeDocumentEntity document = requireDocument(documentId);
        requireDataset(document.getDatasetId());
        LambdaQueryWrapper<KnowledgeChunkEntity> wrapper = new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDocumentId, documentId)
                .orderByAsc(KnowledgeChunkEntity::getChunkIndex)
                .orderByAsc(KnowledgeChunkEntity::getId);
        return chunkMapper.selectList(wrapper).stream()
                .map(this::toChunkSummary)
                .toList();
    }

    @Override
    public PageResult<KnowledgeChunkSummary> listDatasetChunks(Long datasetId, int page, int pageSize) {
        requireDataset(datasetId);
        LambdaQueryWrapper<KnowledgeChunkEntity> wrapper = new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDatasetId, datasetId)
                .orderByAsc(KnowledgeChunkEntity::getDocumentId)
                .orderByAsc(KnowledgeChunkEntity::getChunkIndex)
                .orderByAsc(KnowledgeChunkEntity::getId);
        IPage<KnowledgeChunkEntity> result = chunkMapper.selectPage(
                new Page<>(safePage(page), safeChunkPageSize(pageSize)), wrapper);
        return new PageResult<>(
                result.getCurrent(),
                result.getSize(),
                result.getTotal(),
                result.getRecords().stream().map(this::toChunkSummary).toList()
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RetrievalTestResponse runRetrievalTest(Long datasetId, RetrievalTestRequest request) {
        KnowledgeDatasetEntity dataset = requireDataset(datasetId);
        if (!STATUS_READY.equalsIgnoreCase(defaultText(dataset.getStatus(), ""))) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge dataset is not ready for retrieval");
        }
        String query = request == null ? null : request.getQuery();
        Integer requestedTopK = request == null ? null : request.getTopK();
        int topK = defaultNumber(requestedTopK, DEFAULT_TOP_K);
        if (!hasText(query)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval query is required");
        }
        if ((requestedTopK != null && requestedTopK <= 0) || topK > MAX_TOP_K) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval topK must be between 1 and 50");
        }
        query = query.trim();
        Map<String, Object> metadataFilter = parseMetadataFilter(request == null ? null : request.getMetadataFilter());
        Set<String> queryTokens = tokenize(query);
        List<Double> queryVector = semanticModel(dataset.getEmbeddingModel()) && hasText(query)
                ? embedQuery(query, dataset.getEmbeddingModel())
                : List.of();
        boolean semanticSearch = !queryVector.isEmpty();
        List<KnowledgeChunkEntity> storedChunks = loadRetrievalCandidates(datasetId, query, queryTokens, semanticSearch);
        boolean hasCompatibleSemanticCandidate = semanticSearch && storedChunks.stream()
                .anyMatch(chunk -> hasCompatibleVector(chunk, queryVector));
        List<KnowledgeChunkEntity> rankedEntities = storedChunks.stream()
                .filter(chunk -> !"parent".equalsIgnoreCase(chunk.getChunkType()))
                .filter(chunk -> metadataMatches(chunk, metadataFilter))
                .filter(chunk -> matchesRetrievalQuery(
                        chunk, queryTokens, queryVector, semanticSearch, hasCompatibleSemanticCandidate))
                .sorted(Comparator.comparing((KnowledgeChunkEntity chunk) -> retrievalScore(chunk, queryTokens, queryVector), Comparator.reverseOrder()))
                .toList();
        List<KnowledgeChunkEntity> matchedEntities = uniqueRetrievalContexts(rankedEntities, topK);
        matchedEntities.stream().map(KnowledgeChunkEntity::getDocumentId).distinct()
                .forEach(documentId -> incrementRecall(datasetId, documentId));
        dataset.setHitRate(averageScore(matchedEntities, queryTokens, queryVector));
        dataset.setUpdatedAt(LocalDateTime.now());
        datasetMapper.updateById(dataset);
        Map<Long, KnowledgeChunkEntity> parentChunks = loadParentChunks(datasetId, matchedEntities);
        return new RetrievalTestResponse(String.valueOf(datasetId), query,
                matchedEntities.stream().map(chunk -> toRetrievalChunkSummary(chunk, queryTokens, queryVector, parentChunks)).toList());
    }

    private KnowledgeDatasetEntity requireDataset(Long datasetId) {
        KnowledgeDatasetEntity dataset = datasetMapper.selectById(datasetId);
        if (dataset == null || !owns(dataset.getOwnerUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "knowledge dataset not found");
        }
        return dataset;
    }

    private KnowledgeDocumentEntity requireDocument(Long documentId) {
        if (documentId == null || documentId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge document id is invalid");
        }
        KnowledgeDocumentEntity document = documentMapper.selectById(documentId);
        if (document == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "knowledge document not found");
        }
        return document;
    }

    private KnowledgeDatasetSummary toDatasetSummary(KnowledgeDatasetEntity entity) {
        return new KnowledgeDatasetSummary(
                stringId(entity.getId()),
                entity.getName(),
                entity.getDescription(),
                entity.getStatus(),
                nvl(entity.getDocumentCount()),
                nvl(entity.getProcessingDocumentCount()),
                nvl(entity.getChunkCount()),
                nvl(entity.getFailedChunkCount()),
                nvl(entity.getHitRate()),
                entity.getEmbeddingModel(),
                entity.getRetrievalMode(),
                entity.getOwner(),
                timeString(entity.getUpdatedAt()),
                readTags(entity.getTagsJson())
        );
    }

    private KnowledgeDocumentSummary toDocumentSummary(KnowledgeDocumentEntity entity) {
        return new KnowledgeDocumentSummary(
                stringId(entity.getId()),
                stringId(entity.getDatasetId()),
                entity.getName(),
                entity.getSourceType(),
                entity.getMode(),
                nvl(entity.getCharCount()),
                nvl(entity.getChunkCount()),
                nvl(entity.getRecallCount()),
                timeString(entity.getUploadedAt()),
                entity.getStatus()
        );
    }

    private KnowledgeChunkSummary toChunkSummary(KnowledgeChunkEntity entity) {
        return new KnowledgeChunkSummary(
                stringId(entity.getId()),
                stringId(entity.getDatasetId()),
                stringId(entity.getDocumentId()),
                entity.getSource(),
                entity.getPreview(),
                nvl(entity.getTokens()),
                defaultScore(entity.getScore()),
                entity.getStatus(),
                defaultText(entity.getChunkType(), "general"),
                stringId(entity.getParentChunkId()),
                readMetadata(entity.getMetadataJson())
        );
    }

    private KnowledgeChunkSummary toRetrievalChunkSummary(KnowledgeChunkEntity entity,
                                                           Set<String> queryTokens,
                                                           List<Double> queryVector,
                                                           Map<Long, KnowledgeChunkEntity> parentChunks) {
        double score = queryTokens.isEmpty() && queryVector.isEmpty()
                ? defaultScore(entity.getScore())
                : retrievalScore(entity, queryTokens, queryVector);
        return new KnowledgeChunkSummary(
                stringId(entity.getId()),
                stringId(entity.getDatasetId()),
                stringId(entity.getDocumentId()),
                entity.getSource(),
                retrievalPreview(entity, parentChunks),
                nvl(entity.getTokens()),
                score,
                entity.getStatus(),
                defaultText(entity.getChunkType(), "general"),
                stringId(entity.getParentChunkId()),
                readMetadata(entity.getMetadataJson())
        );
    }

    private List<KnowledgeChunkEntity> loadRetrievalCandidates(Long datasetId,
                                                               String query,
                                                               Set<String> queryTokens,
                                                               boolean semanticSearch) {
        LambdaQueryWrapper<KnowledgeChunkEntity> wrapper = new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDatasetId, datasetId)
                .eq(KnowledgeChunkEntity::getStatus, STATUS_READY)
                .and(nested -> nested.ne(KnowledgeChunkEntity::getChunkType, "parent")
                        .or()
                        .isNull(KnowledgeChunkEntity::getChunkType))
                .apply("EXISTS (SELECT 1 FROM af_knowledge_document d "
                        + "WHERE d.id = af_knowledge_chunk.document_id "
                        + "AND d.dataset_id = af_knowledge_chunk.dataset_id "
                        + "AND d.status = {0})", STATUS_READY)
                .orderByDesc(KnowledgeChunkEntity::getScore)
                .orderByAsc(KnowledgeChunkEntity::getChunkIndex);
        if (!semanticSearch) {
            wrapper.last("LIMIT " + MAX_RETRIEVAL_CANDIDATES);
        }
        if (!semanticSearch) {
            if (queryTokens.isEmpty()) {
                return List.of();
            }
            if (containsHan(query)) {
                wrapper.and(nested -> {
                    boolean first = true;
                    for (String token : queryTokens) {
                        if (!first) {
                            nested.or();
                        }
                        nested.like(KnowledgeChunkEntity::getPreview, token)
                                .or()
                                .like(KnowledgeChunkEntity::getSource, token);
                        first = false;
                    }
                });
            } else {
                wrapper.and(nested -> {
                    nested.apply("MATCH(source, preview) AGAINST ({0} IN NATURAL LANGUAGE MODE)", query);
                    queryTokens.stream()
                            .filter(token -> token.length() < 4)
                            .forEach(token -> nested.or(orClause -> orClause
                                    .like(KnowledgeChunkEntity::getPreview, token)
                                    .or()
                                    .like(KnowledgeChunkEntity::getSource, token)));
                });
            }
        }
        return chunkMapper.selectList(wrapper).stream()
                .filter(chunk -> STATUS_READY.equalsIgnoreCase(defaultText(chunk.getStatus(), "")))
                .filter(chunk -> !"parent".equalsIgnoreCase(chunk.getChunkType()))
                .toList();
    }

    private List<KnowledgeChunkEntity> uniqueRetrievalContexts(List<KnowledgeChunkEntity> rankedEntities, int topK) {
        Set<Long> contextIds = new HashSet<>();
        return rankedEntities.stream()
                .filter(chunk -> contextIds.add(chunk.getParentChunkId() == null
                        ? chunk.getId()
                        : chunk.getParentChunkId()))
                .limit(Math.min(MAX_TOP_K, Math.max(1, topK)))
                .toList();
    }

    private void insertParentChildChunks(Long datasetId,
                                         KnowledgeDocumentEntity document,
                                         List<TextChunk> chunks,
                                         List<EmbeddingResult> embeddings,
                                         DocumentCreateRequest request,
                                         LocalDateTime now) {
        for (int parentStart = 0; parentStart < chunks.size(); parentStart += 2) {
            List<TextChunk> children = chunks.subList(parentStart, Math.min(parentStart + 2, chunks.size()));
            String parentText = children.stream().map(TextChunk::text).reduce((left, right) -> left + "\n\n" + right).orElse("");
            TextChunk parentTextChunk = new TextChunk(parentText, parentStart / 2, 0, parentText.length());
            KnowledgeChunkEntity parent = insertChunk(datasetId, document, parentTextChunk, List.of(), null, "parent", chunkMetadata(request), now, -1);
            for (TextChunk child : children) {
                insertChunk(datasetId, document, child, embeddings, parent.getId(), "child", chunkMetadata(request), now, child.chunkIndex());
            }
        }
    }

    private Map<String, Object> chunkMetadata(DocumentCreateRequest request) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        if (request.getMetadata() != null) {
            metadata.putAll(request.getMetadata());
        }
        if (!metadata.containsKey("sourceType") && hasText(request.getSourceType())) {
            metadata.put("sourceType", request.getSourceType().trim());
        }
        return metadata;
    }

    private KnowledgeChunkEntity insertChunk(Long datasetId,
                                             KnowledgeDocumentEntity document,
                                             TextChunk textChunk,
                                             List<EmbeddingResult> embeddings,
                                             Long parentChunkId,
                                             String chunkType,
                                             Map<String, Object> metadata,
                                             LocalDateTime now) {
        return insertChunk(datasetId, document, textChunk, embeddings, parentChunkId, chunkType, metadata, now, textChunk.chunkIndex());
    }

    private KnowledgeChunkEntity insertChunk(Long datasetId,
                                             KnowledgeDocumentEntity document,
                                             TextChunk textChunk,
                                             List<EmbeddingResult> embeddings,
                                             Long parentChunkId,
                                             String chunkType,
                                             Map<String, Object> metadata,
                                             LocalDateTime now,
                                             int embeddingIndex) {
        KnowledgeChunkEntity chunk = new KnowledgeChunkEntity();
        chunk.setDatasetId(datasetId);
        chunk.setDocumentId(document.getId());
        chunk.setParentChunkId(parentChunkId);
        chunk.setChunkType(chunkType);
        chunk.setSource(document.getName());
        chunk.setPreview(textChunk.text());
        chunk.setMetadataJson(writeJson(metadata == null ? Map.of() : metadata));
        chunk.setTokens(estimateTokens(textChunk.text()));
        chunk.setScore(chunkQualityScore(textChunk.text()));
        if (embeddingIndex >= 0 && embeddingIndex < embeddings.size()) {
            chunk.setVectorJson(writeJson(embeddings.get(embeddingIndex).vector()));
        }
        chunk.setStatus(STATUS_READY);
        chunk.setChunkIndex(textChunk.chunkIndex());
        chunk.setCreatedAt(now);
        chunk.setUpdatedAt(now);
        chunkMapper.insert(chunk);
        return chunk;
    }

    private boolean hasQueryTokenOverlap(KnowledgeChunkEntity chunk, Set<String> queryTokens) {
        Set<String> contentTokens = tokenize(contentText(chunk));
        return queryTokens.stream().anyMatch(contentTokens::contains);
    }

    private Map<Long, KnowledgeChunkEntity> loadParentChunks(Long datasetId, List<KnowledgeChunkEntity> chunks) {
        List<Long> parentIds = chunks.stream()
                .map(KnowledgeChunkEntity::getParentChunkId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (parentIds.isEmpty()) {
            return Map.of();
        }
        Set<Long> childDocumentIds = chunks.stream()
                .map(KnowledgeChunkEntity::getDocumentId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        return chunkMapper.selectBatchIds(parentIds).stream()
                .filter(parent -> Objects.equals(parent.getDatasetId(), datasetId))
                .filter(parent -> childDocumentIds.contains(parent.getDocumentId()))
                .filter(parent -> STATUS_READY.equalsIgnoreCase(defaultText(parent.getStatus(), "")))
                .collect(java.util.stream.Collectors.toMap(KnowledgeChunkEntity::getId, chunk -> chunk));
    }

    private String retrievalPreview(KnowledgeChunkEntity entity, Map<Long, KnowledgeChunkEntity> parentChunks) {
        if (!"child".equalsIgnoreCase(entity.getChunkType()) || entity.getParentChunkId() == null) {
            return entity.getPreview();
        }
        KnowledgeChunkEntity parent = parentChunks.get(entity.getParentChunkId());
        return parent == null || !hasText(parent.getPreview()) ? entity.getPreview() : parent.getPreview();
    }

    private boolean metadataMatches(KnowledgeChunkEntity chunk, Map<String, Object> filter) {
        if (filter.isEmpty()) {
            return true;
        }
        Map<String, Object> metadata = readMetadata(chunk.getMetadataJson());
        return filter.entrySet().stream().allMatch(entry -> metadata.containsKey(entry.getKey())
                && jsonValuesEqual(metadata.get(entry.getKey()), entry.getValue()));
    }

    private boolean jsonValuesEqual(Object left, Object right) {
        return objectMapper.valueToTree(left).equals(objectMapper.valueToTree(right));
    }

    private boolean matchesRetrievalQuery(KnowledgeChunkEntity chunk,
                                          Set<String> queryTokens,
                                          List<Double> queryVector,
                                          boolean semanticSearch,
                                          boolean hasCompatibleSemanticCandidate) {
        if (!semanticSearch || !hasCompatibleSemanticCandidate) {
            return !queryTokens.isEmpty() && hasQueryTokenOverlap(chunk, queryTokens);
        }
        return semanticSimilarity(chunk, queryVector) >= MIN_SEMANTIC_SIMILARITY
                || hasQueryTokenOverlap(chunk, queryTokens);
    }

    private double retrievalScore(KnowledgeChunkEntity chunk, Set<String> queryTokens, List<Double> queryVector) {
        double lexicalScore = lexicalRetrievalScore(chunk, queryTokens);
        if (!hasCompatibleVector(chunk, queryVector)) {
            return lexicalScore;
        }
        double semanticScore = cosineSimilarity(queryVector, vectorFromJson(chunk.getVectorJson()));
        if (queryTokens.isEmpty()) {
            return semanticScore;
        }
        return Math.min(1.0D, 0.7D * semanticScore + 0.3D * lexicalScore);
    }

    private double lexicalRetrievalScore(KnowledgeChunkEntity chunk, Set<String> queryTokens) {
        if (queryTokens.isEmpty()) {
            return defaultScore(chunk.getScore());
        }
        Set<String> contentTokens = tokenize(contentText(chunk));
        long overlapCount = queryTokens.stream().filter(contentTokens::contains).count();
        double overlapRatio = (double) overlapCount / queryTokens.size();
        return Math.min(1.0D, overlapRatio);
    }

    private boolean hasCompatibleVector(KnowledgeChunkEntity chunk, List<Double> queryVector) {
        List<Double> storedVector = vectorFromJson(chunk.getVectorJson());
        return !queryVector.isEmpty() && storedVector.size() == queryVector.size();
    }

    private double semanticSimilarity(KnowledgeChunkEntity chunk, List<Double> queryVector) {
        if (!hasCompatibleVector(chunk, queryVector)) {
            return 0.0D;
        }
        return cosineSimilarity(queryVector, vectorFromJson(chunk.getVectorJson()));
    }

    private int averageScore(List<KnowledgeChunkEntity> chunks,
                             Set<String> queryTokens,
                             List<Double> queryVector) {
        if (chunks.isEmpty()) {
            return 0;
        }
        double average = chunks.stream()
                .mapToDouble(chunk -> retrievalScore(chunk, queryTokens, queryVector))
                .average()
                .orElse(0.0D);
        return (int) Math.round(Math.max(0.0D, Math.min(1.0D, average)) * 100D);
    }

    private List<EmbeddingResult> embedChunks(List<TextChunk> chunks, String model) {
        if (embeddingProviderRegistry == null) {
            return List.of();
        }
        EmbeddingProvider provider = embeddingProviderRegistry.select(EmbeddingNodeConfig.from(
                java.util.Map.of("model", model), embeddingProperties));
        List<EmbeddingResult> results = new ArrayList<>();
        try {
            for (TextChunk chunk : chunks) {
                results.add(provider.embed(new EmbeddingRequest(chunk.text(), model, chunk.chunkIndex(),
                        java.util.Map.of("source", "knowledge"))));
            }
            return List.copyOf(results);
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge embedding failed: " + defaultText(exception.getMessage(), "provider unavailable"));
        }
    }

    private List<Double> embedQuery(String query, String model) {
        List<EmbeddingResult> result = embedChunks(List.of(new TextChunk(query, 0, 0, query.length())), model);
        return result.isEmpty() ? List.of() : result.get(0).vector();
    }

    private boolean semanticModel(String model) {
        String normalized = defaultText(model, "").toLowerCase(Locale.ROOT);
        return !normalized.isBlank() && !normalized.contains("keyword") && !normalized.contains("sparse");
    }

    private List<Double> vectorFromJson(String vectorJson) {
        if (!hasText(vectorJson)) {
            return List.of();
        }
        try {
            List<Double> vector = objectMapper.readValue(vectorJson, new TypeReference<>() {
            });
            return vector == null ? List.of() : vector;
        } catch (JsonProcessingException exception) {
            return List.of();
        }
    }

    private double cosineSimilarity(List<Double> left, List<Double> right) {
        if (left.isEmpty() || right.isEmpty() || left.size() != right.size()) {
            return 0.0D;
        }
        double dot = 0.0D;
        double leftNorm = 0.0D;
        double rightNorm = 0.0D;
        for (int index = 0; index < left.size(); index++) {
            double leftValue = left.get(index);
            double rightValue = right.get(index);
            dot += leftValue * rightValue;
            leftNorm += leftValue * leftValue;
            rightNorm += rightValue * rightValue;
        }
        if (leftNorm == 0.0D || rightNorm == 0.0D) {
            return 0.0D;
        }
        return Math.max(0.0D, Math.min(1.0D, dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))));
    }

    private void incrementRecall(Long datasetId, Long documentId) {
        if (documentId == null) {
            return;
        }
        KnowledgeDocumentEntity document = documentMapper.selectById(documentId);
        if (document == null || !Objects.equals(datasetId, document.getDatasetId())) {
            return;
        }
        documentMapper.incrementRecall(documentId, LocalDateTime.now());
    }

    private boolean isDatasetReferencedByWorkflow(Long datasetId) {
        if (workflowDefinitionMapper == null || datasetId == null) {
            return false;
        }
        List<WorkflowDefinition> definitions = workflowDefinitionMapper.selectList(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getOwnerUserId, currentUserId())
                        .ne(WorkflowDefinition::getStatus, "DELETED"));
        String needle = String.valueOf(datasetId);
        return definitions.stream().anyMatch(definition -> definitionJsonContainsDataset(definition.getDefinitionJson(), needle));
    }

    private boolean definitionJsonContainsDataset(String definitionJson, String datasetId) {
        if (!hasText(definitionJson)) {
            return false;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(definitionJson);
            java.util.Iterator<com.fasterxml.jackson.databind.JsonNode> nodes = root == null
                    ? java.util.Collections.emptyIterator()
                    : root.findValues("datasetId").iterator();
            while (nodes.hasNext()) {
                com.fasterxml.jackson.databind.JsonNode value = nodes.next();
                if (datasetId.equals(value.asText())) {
                    return true;
                }
            }
            return false;
        } catch (JsonProcessingException ignored) {
            // Invalid definitions are handled by workflow validation; do not make
            // deletion unsafe by treating malformed JSON as an unreferenced graph.
            return true;
        }
    }

    private double chunkQualityScore(String text) {
        int length = text == null ? 0 : text.strip().length();
        return Math.min(0.95D, Math.max(0.1D, length / 1024D));
    }

    private String contentText(KnowledgeChunkEntity chunk) {
        return defaultText(chunk.getSource(), "") + " " + defaultText(chunk.getPreview(), "");
    }

    private Set<String> tokenize(String value) {
        if (!hasText(value)) {
            return Set.of();
        }
        Set<String> tokens = new HashSet<>();
        Matcher matcher = RETRIEVAL_TOKEN_PATTERN.matcher(value.toLowerCase(Locale.ROOT));
        while (matcher.find()) {
            String token = matcher.group();
            if (token.codePoints().allMatch(character -> Character.UnicodeScript.of(character) == Character.UnicodeScript.HAN)) {
                if (token.length() == 1) {
                    tokens.add(token);
                } else {
                    for (int index = 0; index < token.length() - 1; index++) {
                        tokens.add(token.substring(index, index + 2));
                    }
                }
            } else {
                tokens.add(token);
            }
        }
        return tokens;
    }

    private boolean containsHan(String value) {
        return value != null && value.codePoints()
                .anyMatch(character -> Character.UnicodeScript.of(character) == Character.UnicodeScript.HAN);
    }

    private List<String> readTags(String tagsJson) {
        if (!hasText(tagsJson)) {
            return List.of();
        }
        try {
            List<String> tags = objectMapper.readValue(tagsJson, new TypeReference<>() {
            });
            return tags == null ? List.of() : tags;
        } catch (JsonProcessingException exception) {
            return List.of();
        }
    }

    private Map<String, Object> readMetadata(String metadataJson) {
        if (!hasText(metadataJson)) {
            return Map.of();
        }
        try {
            Map<String, Object> metadata = objectMapper.readValue(metadataJson, new TypeReference<>() {
            });
            return metadata == null
                    ? Map.of()
                    : Collections.unmodifiableMap(new LinkedHashMap<>(metadata));
        } catch (JsonProcessingException exception) {
            return Map.of();
        }
    }

    private Map<String, Object> parseMetadataFilter(String metadataFilter) {
        if (!hasText(metadataFilter)) {
            return Map.of();
        }
        try {
            Map<String, Object> filter = objectMapper.readValue(metadataFilter, new TypeReference<>() {
            });
            if (filter == null) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval metadataFilter must be a JSON object");
            }
            if (filter.isEmpty()) {
                return Map.of();
            }
            return new LinkedHashMap<>(filter);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge retrieval metadataFilter must be valid JSON");
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge metadata json serialization failed");
        }
    }

    private int estimateTokens(String text) {
        if (!hasText(text)) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(text.length() / 4.0D));
    }

    private int safePage(int page) {
        return page <= 0 ? DEFAULT_PAGE : page;
    }

    private int safePageSize(int pageSize) {
        return pageSize <= 0 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, 100);
    }

    private int safeChunkPageSize(int pageSize) {
        return pageSize <= 0 ? DEFAULT_CHUNK_PAGE_SIZE : Math.min(pageSize, 100);
    }

    private int defaultNumber(Integer value, int fallback) {
        return value == null || value <= 0 ? fallback : value;
    }

    private String defaultText(String value, String fallback) {
        return hasText(value) ? value : fallback;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String normalizedIdempotencyKey(String value) {
        if (!hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private KnowledgeDatasetEntity findDatasetByIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null) {
            return null;
        }
        return datasetMapper.selectOne(new LambdaQueryWrapper<KnowledgeDatasetEntity>()
                .eq(KnowledgeDatasetEntity::getOwnerUserId, currentUserId())
                .eq(KnowledgeDatasetEntity::getIdempotencyKey, idempotencyKey)
                .last("LIMIT 1"));
    }

    private KnowledgeDocumentEntity findDocumentByIdempotencyKey(Long datasetId, String idempotencyKey) {
        if (idempotencyKey == null) {
            return null;
        }
        return documentMapper.selectOne(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                .eq(KnowledgeDocumentEntity::getDatasetId, datasetId)
                .eq(KnowledgeDocumentEntity::getIdempotencyKey, idempotencyKey)
                .last("LIMIT 1"));
    }

    private Integer nvl(Integer value) {
        return Objects.requireNonNullElse(value, 0);
    }

    private Double defaultScore(Double value) {
        return value == null ? 0.0D : value;
    }

    private String stringId(Long value) {
        return value == null ? null : String.valueOf(value);
    }

    private String timeString(LocalDateTime value) {
        return value == null ? null : value.toString();
    }

    private static Long currentUserId() {
        return AuthenticatedUserContext.requireUserId();
    }

    private static String currentUsername() {
        return AuthenticatedUserContext.usernameOrDefault(DEFAULT_OWNER);
    }

    private static boolean owns(Long ownerUserId) {
        return ownerUserId != null && ownerUserId.equals(currentUserId());
    }
}
