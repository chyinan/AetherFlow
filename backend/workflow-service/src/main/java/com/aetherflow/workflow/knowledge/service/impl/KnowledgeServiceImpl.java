package com.aetherflow.workflow.knowledge.service.impl;

// pattern: Mixed (needs refactoring)
// 说明：历史实现同时包含持久化编排与检索排序；新增文档预处理逻辑已提取到 Functional Core。

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.SimpleTextSplitter;
import com.aetherflow.workflow.embedding.TextChunk;
import com.aetherflow.workflow.embedding.EmbeddingNodeConfig;
import com.aetherflow.workflow.embedding.EmbeddingRequest;
import com.aetherflow.workflow.embedding.EmbeddingResult;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.embedding.provider.EmbeddingProvider;
import com.aetherflow.workflow.embedding.provider.EmbeddingProviderRegistry;
import com.aetherflow.workflow.document.DocumentContentExtractionService;
import com.aetherflow.workflow.document.DocumentExtractionResult;
import com.aetherflow.workflow.document.DocumentExtractionProperties;
import com.aetherflow.workflow.document.DocumentInput;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DatasetCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDatasetSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDocumentSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeSourcePreview;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;
import com.aetherflow.workflow.knowledge.KnowledgeDocumentLimits;
import com.aetherflow.workflow.knowledge.ingestion.KnowledgeIngestionJobEntity;
import com.aetherflow.workflow.knowledge.ingestion.KnowledgeIngestionJobMapper;
import com.aetherflow.workflow.knowledge.ingestion.KnowledgeIngestionProperties;
import com.aetherflow.workflow.knowledge.entity.KnowledgeChunkEntity;
import com.aetherflow.workflow.knowledge.entity.KnowledgeDatasetEntity;
import com.aetherflow.workflow.knowledge.entity.KnowledgeDocumentEntity;
import com.aetherflow.workflow.knowledge.mapper.KnowledgeChunkMapper;
import com.aetherflow.workflow.knowledge.mapper.KnowledgeDatasetMapper;
import com.aetherflow.workflow.knowledge.mapper.KnowledgeDocumentMapper;
import com.aetherflow.workflow.knowledge.vector.KnowledgeVectorIndex;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import lombok.extern.slf4j.Slf4j;

import java.time.LocalDateTime;
import java.time.Duration;
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
import java.util.concurrent.Executor;
import org.springframework.http.ResponseEntity;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
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
    private static final int SEMANTIC_PAGE_SIZE = 500;
    private static final int MAX_SEMANTIC_BUFFER = 1_000;
    private static final double MIN_SEMANTIC_SIMILARITY = 0.35D;
    private static final Pattern RETRIEVAL_TOKEN_PATTERN = Pattern.compile("[\\p{IsHan}]+|[\\p{L}\\p{N}]+");

    private final KnowledgeDatasetMapper datasetMapper;
    private final KnowledgeDocumentMapper documentMapper;
    private final KnowledgeChunkMapper chunkMapper;
    private final SimpleTextSplitter textSplitter;
    private final ObjectMapper objectMapper;
    private final EmbeddingProviderRegistry embeddingProviderRegistry;
    private final EmbeddingProperties embeddingProperties;
    private final DocumentContentExtractionService documentContentExtractionService;
    private final DocumentExtractionProperties documentExtractionProperties;

    @Autowired(required = false)
    private WorkflowDefinitionMapper workflowDefinitionMapper;

    @Autowired(required = false)
    private FileMetadataClient fileMetadataClient;

    @Autowired(required = false)
    private WorkflowNodeProperties workflowNodeProperties;

    @Autowired(required = false)
    private KnowledgeIngestionJobMapper ingestionJobMapper;

    @Autowired(required = false)
    private KnowledgeIngestionProperties ingestionProperties;

    @Autowired(required = false)
    private KnowledgeVectorIndex knowledgeVectorIndex;

    @Autowired(required = false)
    @org.springframework.beans.factory.annotation.Qualifier("knowledgeIngestionTaskExecutor")
    private Executor ingestionExecutor;

    @Autowired
    public KnowledgeServiceImpl(KnowledgeDatasetMapper datasetMapper,
                                KnowledgeDocumentMapper documentMapper,
                                KnowledgeChunkMapper chunkMapper,
                                SimpleTextSplitter textSplitter,
                                ObjectMapper objectMapper,
                                EmbeddingProviderRegistry embeddingProviderRegistry,
                                EmbeddingProperties embeddingProperties,
                                DocumentContentExtractionService documentContentExtractionService,
                                DocumentExtractionProperties documentExtractionProperties) {
        this.datasetMapper = datasetMapper;
        this.documentMapper = documentMapper;
        this.chunkMapper = chunkMapper;
        this.textSplitter = textSplitter;
        this.objectMapper = objectMapper;
        this.embeddingProviderRegistry = embeddingProviderRegistry;
        this.embeddingProperties = embeddingProperties;
        this.documentContentExtractionService = documentContentExtractionService;
        this.documentExtractionProperties = documentExtractionProperties;
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
        if (hasText(request.getFileId())) {
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
        String rawContent = resolveDocumentContent(request);
        String content = KnowledgeDocumentPreparation.preprocessContent(
                rawContent,
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
    public KnowledgeDocumentSummary enqueueDocument(Long datasetId, DocumentCreateRequest request) {
        if (request == null || !hasText(request.getFileId())) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge ingestion requires a fileId");
        }
        KnowledgeDatasetEntity dataset = requireDataset(datasetId);
        validateFileId(request.getFileId());
        String idempotencyKey = normalizedIdempotencyKey(request.getIdempotencyKey());
        KnowledgeDocumentEntity existing = findExistingDocument(datasetId, idempotencyKey, request.getFileId());
        if (existing != null) {
            if ("failed".equalsIgnoreCase(existing.getStatus())) {
                return resetFailedIngestion(dataset, existing, request);
            }
            return toDocumentSummary(existing);
        }
        if (ingestionJobMapper == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge ingestion service is unavailable");
        }
        if (ingestionProperties != null && !ingestionProperties.isEnabled()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge ingestion is temporarily disabled");
        }
        LocalDateTime now = LocalDateTime.now();
        KnowledgeDocumentEntity document = new KnowledgeDocumentEntity();
        document.setDatasetId(datasetId);
        document.setIdempotencyKey(idempotencyKey);
        document.setName(defaultText(request.getSourceName(), "document-" + datasetId));
        document.setSourceType(defaultText(request.getSourceType(), DEFAULT_SOURCE_TYPE));
        document.setFileId(request.getFileId().trim());
        document.setMode(defaultText(request.getMode(), DEFAULT_DOCUMENT_MODE));
        document.setCharCount(0);
        document.setChunkCount(0);
        document.setRecallCount(0);
        document.setStatus("processing");
        document.setErrorMessage(null);
        document.setUploadedAt(now);
        document.setCreatedAt(now);
        document.setUpdatedAt(now);
        try {
            documentMapper.insert(document);
        } catch (DuplicateKeyException exception) {
            KnowledgeDocumentEntity duplicate = findExistingDocument(datasetId, idempotencyKey, request.getFileId());
            if (duplicate != null) {
                return toDocumentSummary(duplicate);
            }
            throw exception;
        }

        KnowledgeIngestionJobEntity job = new KnowledgeIngestionJobEntity();
        job.setDatasetId(datasetId);
        job.setDocumentId(document.getId());
        job.setOwnerUserId(currentUserId());
        job.setPayloadJson(writeJson(request));
        job.setStatus(KnowledgeIngestionJobEntity.PENDING);
        job.setAttemptCount(0);
        job.setNextAttemptAt(now);
        job.setCreatedAt(now);
        job.setUpdatedAt(now);
        ingestionJobMapper.insert(job);
        if (datasetMapper.startIngestion(datasetId, now) != 1) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR,
                    "knowledge dataset ingestion counter update failed");
        }
        submitIngestionAfterCommit(job.getId());
        return toDocumentSummary(document);
    }

    @Override
    public KnowledgeSourcePreview previewSource(String fileId) {
        DocumentInput input = downloadDocumentInput(fileId, currentUserId(), "document");
        DocumentExtractionResult result = extractDocument(input);
        return new KnowledgeSourcePreview(
                input.fileName(),
                result.text(),
                result.detectedContentType(),
                result.text().length(),
                result.pageCount()
        );
    }

    private KnowledgeDocumentSummary resetFailedIngestion(KnowledgeDatasetEntity dataset,
                                                          KnowledgeDocumentEntity document,
                                                          DocumentCreateRequest request) {
        if (ingestionJobMapper == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge ingestion service is unavailable");
        }
        LocalDateTime now = LocalDateTime.now();
        KnowledgeIngestionJobEntity job = ingestionJobMapper.selectOne(new LambdaQueryWrapper<KnowledgeIngestionJobEntity>()
                .eq(KnowledgeIngestionJobEntity::getDocumentId, document.getId())
                .last("LIMIT 1"));
        if (job == null) {
            throw new BusinessException(ResultCode.CONFLICT,
                    "failed knowledge ingestion job is missing; delete the document and import again");
        }
        document.setStatus("processing");
        document.setErrorMessage(null);
        document.setCharCount(0);
        document.setChunkCount(0);
        document.setUpdatedAt(now);
        documentMapper.updateById(document);
        job.setStatus(KnowledgeIngestionJobEntity.PENDING);
        job.setAttemptCount(0);
        job.setPayloadJson(writeJson(request));
        job.setNextAttemptAt(now);
        job.setLastError(null);
        job.setUpdatedAt(now);
        ingestionJobMapper.updateById(job);
        if (datasetMapper.startIngestion(dataset.getId(), now) != 1) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR,
                    "knowledge dataset ingestion counter update failed");
        }
        submitIngestionAfterCommit(job.getId());
        return toDocumentSummary(document);
    }

    /** 由持久摄取任务执行器调用；作业状态由数据库 claim 保证单消费者语义。 */
    @Transactional(rollbackFor = Exception.class)
    public void processQueuedDocument(Long jobId) {
        if (ingestionJobMapper == null || jobId == null) {
            return;
        }
        KnowledgeIngestionJobEntity job = ingestionJobMapper.selectById(jobId);
        if (job == null || !KnowledgeIngestionJobEntity.PROCESSING.equals(job.getStatus())) {
            return;
        }
        KnowledgeDocumentEntity document = documentMapper.selectById(job.getDocumentId());
        if (document == null || !"processing".equalsIgnoreCase(document.getStatus())) {
            ingestionJobMapper.finishAttempt(jobId, KnowledgeIngestionJobEntity.FAILED,
                    nvl(job.getAttemptCount()), null, "document is no longer processable", LocalDateTime.now());
            return;
        }
        int attempt = nvl(job.getAttemptCount()) + 1;
        try {
            DocumentCreateRequest request = objectMapper.readValue(job.getPayloadJson(), DocumentCreateRequest.class);
            String content = KnowledgeDocumentPreparation.preprocessContent(
                    resolveDocumentContent(request, job.getOwnerUserId()),
                    Boolean.TRUE.equals(request.getCleanSpaces()),
                    Boolean.TRUE.equals(request.getCleanUrls()));
            if (!hasText(content)) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge document content is required");
            }
            KnowledgeDocumentPreparation.ChunkSettings settings = KnowledgeDocumentPreparation.resolveChunkSettings(
                    request.getChunkSize(), request.getOverlap(), DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP);
            boolean parentChild = "parentChild".equalsIgnoreCase(defaultText(request.getMode(), DEFAULT_DOCUMENT_MODE));
            KnowledgeDocumentPreparation.validateProjectedChunkCount(content, settings, request.getDelimiter(), parentChild);
            List<TextChunk> chunks = textSplitter.split(content, settings.chunkSize(), settings.overlap(), request.getDelimiter());
            int persistedChunkCount = parentChild ? chunks.size() + (chunks.size() + 1) / 2 : chunks.size();
            KnowledgeDocumentPreparation.validateChunkCount(persistedChunkCount);
            String model = defaultText(datasetMapper.selectById(job.getDatasetId()).getEmbeddingModel(), DEFAULT_EMBEDDING_MODEL);
            List<EmbeddingResult> embeddings = semanticModel(model) ? embedChunks(chunks, model) : List.of();
            chunkMapper.delete(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                    .eq(KnowledgeChunkEntity::getDocumentId, document.getId()));
            LocalDateTime now = LocalDateTime.now();
            if (parentChild) {
                insertParentChildChunks(job.getDatasetId(), document, chunks, embeddings, request, now);
            } else {
                for (TextChunk chunk : chunks) {
                    insertChunk(job.getDatasetId(), document, chunk, embeddings, null, "general", chunkMetadata(request), now);
                }
            }
            document.setCharCount(content.length());
            document.setChunkCount(persistedChunkCount);
            document.setStatus(STATUS_READY);
            document.setErrorMessage(null);
            document.setUpdatedAt(now);
            documentMapper.updateById(document);
            if (datasetMapper.completeIngestion(job.getDatasetId(), persistedChunkCount, now) != 1) {
                throw new BusinessException(ResultCode.INTERNAL_ERROR, "knowledge dataset counter update failed");
            }
            ingestionJobMapper.finishAttempt(jobId, KnowledgeIngestionJobEntity.SUCCEEDED,
                    attempt, null, null, now);
        } catch (RuntimeException exception) {
            handleIngestionFailure(job, document, attempt, exception);
        } catch (JsonProcessingException exception) {
            handleIngestionFailure(job, document, attempt, exception);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDocument(Long documentId) {
        KnowledgeDocumentEntity document = requireDocument(documentId);
        requireDataset(document.getDatasetId());
        int deletedChunks = nvl(document.getChunkCount());
        boolean processing = "processing".equalsIgnoreCase(document.getStatus());
        if (ingestionJobMapper != null) {
            ingestionJobMapper.deleteByDocumentId(documentId);
        }
        chunkMapper.delete(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDocumentId, documentId));
        documentMapper.deleteById(documentId);
        LocalDateTime now = LocalDateTime.now();
        int updated = processing
                ? datasetMapper.cancelIngestion(document.getDatasetId(), now)
                : datasetMapper.decrementDocumentCounters(document.getDatasetId(), deletedChunks, now);
        if (updated != 1) {
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
        List<Double> embeddedQueryVector = List.of();
        if (semanticModel(dataset.getEmbeddingModel()) && hasText(query)) {
            try {
                embeddedQueryVector = embedQuery(query, dataset.getEmbeddingModel());
            } catch (BusinessException exception) {
                // Semantic retrieval is an enhancement; a provider outage must
                // degrade to the indexed lexical path instead of taking down RAG.
                log.warn("knowledge semantic retrieval degraded to lexical, datasetId={}, reason={}",
                        datasetId, exception.getMessage());
            }
        }
        List<Double> queryVector = List.copyOf(embeddedQueryVector);
        boolean semanticSearch = !queryVector.isEmpty();
        List<KnowledgeChunkEntity> storedChunks = semanticSearch
                ? loadSemanticRetrievalCandidates(datasetId, queryTokens, queryVector, metadataFilter, topK)
                : loadRetrievalCandidates(datasetId, query, queryTokens, false);
        boolean hasCompatibleSemanticCandidate = semanticSearch;
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

    @Override
    public int reindexVectorIndex(Long datasetId) {
        requireDataset(datasetId);
        if (knowledgeVectorIndex == null || !isKnowledgeVectorIndexAvailable()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge semantic vector index is not available");
        }
        LambdaQueryWrapper<KnowledgeChunkEntity> wrapper = retrievalBaseWrapper(datasetId)
                .orderByAsc(KnowledgeChunkEntity::getId);
        int indexed = 0;
        long pageNo = 1;
        while (true) {
            IPage<KnowledgeChunkEntity> page = chunkMapper.selectPage(new Page<>(pageNo, SEMANTIC_PAGE_SIZE, false), wrapper);
            if (page == null) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "knowledge vector index rebuild requires paged database access");
            }
            List<KnowledgeChunkEntity> records = page.getRecords() == null ? List.of() : page.getRecords();
            for (KnowledgeChunkEntity chunk : records) {
                List<Double> vector = vectorFromJson(chunk.getVectorJson());
                if (vector.isEmpty()) {
                    continue;
                }
                knowledgeVectorIndex.upsert(chunk, vector);
                indexed++;
            }
            if (records.size() < SEMANTIC_PAGE_SIZE) {
                return indexed;
            }
            pageNo++;
        }
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
                entity.getStatus(),
                entity.getErrorMessage()
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

    /**
     * 分页扫描语义候选并只在 JVM 中保留有界 Top-N。
     * 这里没有人为截断语义候选：数据库分页会持续读取到末页，缓冲区只
     * 限制排序阶段的内存，不改变“全量候选可参与比较”的语义。
     */
    private List<KnowledgeChunkEntity> loadSemanticRetrievalCandidates(Long datasetId,
                                                                         Set<String> queryTokens,
                                                                         List<Double> queryVector,
                                                                         Map<String, Object> metadataFilter,
                                                                         int topK) {
        if (knowledgeVectorIndex != null) {
            boolean indexAvailable = isKnowledgeVectorIndexAvailable();
            if (indexAvailable) {
                try {
                    List<Long> indexedIds = knowledgeVectorIndex.search(
                            datasetId, queryVector, Math.min(MAX_SEMANTIC_BUFFER, Math.max(50, topK * 20)), metadataFilter);
                    return loadIndexedSemanticCandidates(indexedIds, queryTokens, queryVector, metadataFilter);
                } catch (RuntimeException exception) {
                    if (embeddingProperties.isKnowledgeVectorIndexRequired()) {
                        throw exception;
                    }
                    log.warn("knowledge semantic index unavailable, falling back to paged SQL scan, datasetId={}",
                            datasetId, exception);
                }
            } else if (embeddingProperties.isKnowledgeVectorIndexRequired()) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "knowledge semantic vector index is not available");
            }
        } else if (embeddingProperties.isKnowledgeVectorIndexRequired()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge semantic vector index is not configured");
        }
        LambdaQueryWrapper<KnowledgeChunkEntity> wrapper = retrievalBaseWrapper(datasetId)
                .orderByAsc(KnowledgeChunkEntity::getId);
        int bufferSize = Math.min(MAX_SEMANTIC_BUFFER, Math.max(50, topK * 20));
        java.util.PriorityQueue<KnowledgeChunkEntity> buffer = new java.util.PriorityQueue<>(
                Comparator.comparingDouble(chunk -> retrievalScore(chunk, queryTokens, queryVector)));
        long pageNo = 1;
        boolean pagedQuerySupported = true;
        while (true) {
            IPage<KnowledgeChunkEntity> page;
            if (pagedQuerySupported) {
                page = chunkMapper.selectPage(new Page<>(pageNo, SEMANTIC_PAGE_SIZE, false), wrapper);
                if (page == null) {
                    // Unit-test doubles and legacy mappers may not implement
                    // selectPage; retain a safe compatibility fallback.
                    pagedQuerySupported = false;
                    return boundedSemanticCandidates(chunkMapper.selectList(wrapper), queryTokens,
                            queryVector, metadataFilter, bufferSize);
                }
            } else {
                break;
            }
            List<KnowledgeChunkEntity> records = page.getRecords() == null ? List.of() : page.getRecords();
            for (KnowledgeChunkEntity chunk : records) {
                if (chunk == null || !metadataMatches(chunk, metadataFilter)
                        || !matchesRetrievalQuery(chunk, queryTokens, queryVector, true, true)) {
                    continue;
                }
                buffer.offer(chunk);
                if (buffer.size() > bufferSize) {
                    buffer.poll();
                }
            }
            if (records.size() < SEMANTIC_PAGE_SIZE) {
                break;
            }
            pageNo++;
        }
        return buffer.stream()
                .sorted(Comparator.comparingDouble((KnowledgeChunkEntity chunk) -> retrievalScore(chunk, queryTokens, queryVector))
                        .reversed()
                        .thenComparing(KnowledgeChunkEntity::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private List<KnowledgeChunkEntity> loadIndexedSemanticCandidates(List<Long> ids,
                                                                       Set<String> queryTokens,
                                                                       List<Double> queryVector,
                                                                       Map<String, Object> metadataFilter) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        List<KnowledgeChunkEntity> records = chunkMapper.selectBatchIds(ids);
        if (records == null || records.isEmpty()) {
            return List.of();
        }
        Map<Long, KnowledgeChunkEntity> byId = records.stream()
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toMap(KnowledgeChunkEntity::getId, chunk -> chunk,
                        (left, right) -> left));
        return ids.stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .filter(chunk -> STATUS_READY.equalsIgnoreCase(defaultText(chunk.getStatus(), "")))
                .filter(chunk -> !"parent".equalsIgnoreCase(chunk.getChunkType()))
                .filter(chunk -> metadataMatches(chunk, metadataFilter))
                .filter(chunk -> matchesRetrievalQuery(chunk, queryTokens, queryVector, true, true))
                .toList();
    }

    private boolean isKnowledgeVectorIndexAvailable() {
        try {
            return knowledgeVectorIndex.isAvailable();
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private List<KnowledgeChunkEntity> boundedSemanticCandidates(List<KnowledgeChunkEntity> chunks,
                                                                  Set<String> queryTokens,
                                                                  List<Double> queryVector,
                                                                  Map<String, Object> metadataFilter,
                                                                  int bufferSize) {
        if (chunks == null || chunks.isEmpty()) {
            return List.of();
        }
        java.util.PriorityQueue<KnowledgeChunkEntity> buffer = new java.util.PriorityQueue<>(
                Comparator.comparingDouble(chunk -> retrievalScore(chunk, queryTokens, queryVector)));
        for (KnowledgeChunkEntity chunk : chunks) {
            if (chunk == null || !metadataMatches(chunk, metadataFilter)
                    || !matchesRetrievalQuery(chunk, queryTokens, queryVector, true, true)) {
                continue;
            }
            buffer.offer(chunk);
            if (buffer.size() > bufferSize) {
                buffer.poll();
            }
        }
        return buffer.stream()
                .sorted(Comparator.comparingDouble((KnowledgeChunkEntity chunk) -> retrievalScore(chunk, queryTokens, queryVector))
                        .reversed()
                        .thenComparing(KnowledgeChunkEntity::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private LambdaQueryWrapper<KnowledgeChunkEntity> retrievalBaseWrapper(Long datasetId) {
        return new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDatasetId, datasetId)
                .eq(KnowledgeChunkEntity::getStatus, STATUS_READY)
                .and(nested -> nested.ne(KnowledgeChunkEntity::getChunkType, "parent")
                        .or()
                        .isNull(KnowledgeChunkEntity::getChunkType))
                .apply("EXISTS (SELECT 1 FROM af_knowledge_document d "
                        + "WHERE d.id = af_knowledge_chunk.document_id "
                        + "AND d.dataset_id = af_knowledge_chunk.dataset_id "
                        + "AND d.status = {0})", STATUS_READY);
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
        if (embeddingIndex >= 0 && embeddingIndex < embeddings.size()
                && knowledgeVectorIndex != null && isKnowledgeVectorIndexAvailable()) {
            try {
                knowledgeVectorIndex.upsert(chunk, embeddings.get(embeddingIndex).vector());
            } catch (RuntimeException exception) {
                if (embeddingProperties.isKnowledgeVectorIndexRequired()) {
                    throw exception;
                }
                log.warn("knowledge vector index upsert failed, chunkId={}", chunk.getId(), exception);
            }
        } else if (embeddingIndex >= 0 && embeddingIndex < embeddings.size()
                && embeddingProperties.isKnowledgeVectorIndexRequired()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge semantic vector index is not available");
        }
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

    private String resolveDocumentContent(DocumentCreateRequest request) {
        return resolveDocumentContent(request, currentUserId());
    }

    private String resolveDocumentContent(DocumentCreateRequest request, Long userId) {
        if (hasText(request.getContent())) {
            return request.getContent();
        }
        if (!hasText(request.getFileId())) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge document content or fileId is required");
        }
        DocumentInput input = downloadDocumentInput(
                request.getFileId(), userId, defaultText(request.getSourceName(), "document"));
        return extractDocument(input).text();
    }

    private DocumentInput downloadDocumentInput(String rawFileId, Long userId, String fallbackFileName) {
        long fileId = validatedFileId(rawFileId);
        if (fileMetadataClient == null || workflowNodeProperties == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "file content service is unavailable for knowledge ingestion");
        }
        String internalToken = workflowNodeProperties.issueFileInternalToken();
        validateDeclaredFileSize(internalToken, userId, fileId);
        ResponseEntity<byte[]> response;
        try {
            response = fileMetadataClient.downloadFile(internalToken, userId, fileId);
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge source file download failed");
        }
        if (response == null || !response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge source file download failed");
        }
        ContentDisposition disposition = response.getHeaders().getContentDisposition();
        String responseFileName = disposition == null ? null : disposition.getFilename();
        MediaType mediaType = response.getHeaders().getContentType();
        return new DocumentInput(
                hasText(responseFileName) ? responseFileName : fallbackFileName,
                mediaType == null ? "application/octet-stream" : mediaType.toString(),
                response.getBody()
        );
    }

    private void validateDeclaredFileSize(String internalToken, Long userId, long fileId) {
        Result<FileMetadataDTO> metadataResult;
        try {
            metadataResult = fileMetadataClient.getMetadata(internalToken, userId, fileId);
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge source file metadata lookup failed");
        }
        if (metadataResult == null || !metadataResult.isSuccess() || metadataResult.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "knowledge source file metadata lookup failed");
        }
        Long size = metadataResult.getData().getSize();
        if (size != null && size > documentExtractionProperties.getMaxFileBytes()) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "document file size exceeds " + documentExtractionProperties.getMaxFileBytes() + " bytes");
        }
    }

    private long validatedFileId(String rawFileId) {
        try {
            long fileId = Long.parseLong(rawFileId == null ? "" : rawFileId.trim());
            if (fileId <= 0) {
                throw new NumberFormatException("file id must be positive");
            }
            return fileId;
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge document fileId is invalid");
        }
    }

    private DocumentExtractionResult extractDocument(DocumentInput input) {
        DocumentExtractionResult result;
        try {
            result = documentContentExtractionService.extract(input, "auto");
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "knowledge document extraction failed");
        }
        if (result == null || !hasText(result.text())) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge source file does not contain extractable text");
        }
        if (result.text().length() > KnowledgeDocumentLimits.MAX_DOCUMENT_CHARS) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "knowledge document content must not exceed 1000000 characters");
        }
        return result;
    }

    private KnowledgeDocumentEntity findExistingDocument(Long datasetId,
                                                          String idempotencyKey,
                                                          String fileId) {
        if (idempotencyKey != null) {
            KnowledgeDocumentEntity byKey = documentMapper.selectOne(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                    .eq(KnowledgeDocumentEntity::getDatasetId, datasetId)
                    .eq(KnowledgeDocumentEntity::getIdempotencyKey, idempotencyKey)
                    .last("LIMIT 1"));
            if (byKey != null) {
                return byKey;
            }
        }
        if (!hasText(fileId)) {
            return null;
        }
        return documentMapper.selectOne(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                .eq(KnowledgeDocumentEntity::getDatasetId, datasetId)
                .eq(KnowledgeDocumentEntity::getFileId, fileId.trim())
                .ne(KnowledgeDocumentEntity::getStatus, "deleted")
                .last("LIMIT 1"));
    }

    private void validateFileId(String fileId) {
        try {
            long parsed = Long.parseLong(fileId.trim());
            if (parsed <= 0) {
                throw new NumberFormatException("file id must be positive");
            }
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "knowledge document fileId is invalid");
        }
    }

    private void submitIngestionAfterCommit(Long jobId) {
        Runnable submit = () -> {
            if (ingestionExecutor == null || ingestionProperties == null || !ingestionProperties.isEnabled()) {
                return;
            }
            try {
                ingestionExecutor.execute(() -> processClaimedJob(jobId));
            } catch (TaskRejectedException exception) {
                log.warn("knowledge ingestion executor is saturated, jobId={}", jobId);
            }
        };
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            submit.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                submit.run();
            }
        });
    }

    private void processClaimedJob(Long jobId) {
        try {
            if (ingestionJobMapper == null
                    || ingestionJobMapper.claim(jobId, LocalDateTime.now()) != 1) {
                return;
            }
            processQueuedDocument(jobId);
        } catch (RuntimeException exception) {
            log.error("knowledge ingestion job crashed outside transaction, jobId={}, reason={}",
                    jobId, exception.getMessage(), exception);
        }
    }

    private void handleIngestionFailure(KnowledgeIngestionJobEntity job,
                                        KnowledgeDocumentEntity document,
                                        int attempt,
                                        Exception exception) {
        if (ingestionJobMapper == null) {
            throw new IllegalStateException("knowledge ingestion job mapper unavailable", exception);
        }
        String message = safeError(exception);
        int maxAttempts = ingestionProperties == null ? 3 : Math.max(1, ingestionProperties.getMaxAttempts());
        LocalDateTime now = LocalDateTime.now();
        chunkMapper.delete(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDocumentId, document.getId()));
        if (attempt >= maxAttempts) {
            document.setStatus("failed");
            document.setErrorMessage(message);
            document.setUpdatedAt(now);
            documentMapper.updateById(document);
            datasetMapper.failIngestion(job.getDatasetId(), now);
            ingestionJobMapper.finishAttempt(job.getId(), KnowledgeIngestionJobEntity.FAILED,
                    attempt, null, message, now);
            log.error("knowledge ingestion failed permanently, jobId={}, documentId={}, reason={}",
                    job.getId(), job.getDocumentId(), message);
            return;
        }
        document.setErrorMessage(message);
        document.setUpdatedAt(now);
        documentMapper.updateById(document);
        Duration retryDelay = ingestionProperties == null
                ? Duration.ofMinutes(1)
                : ingestionProperties.getRetryDelay();
        LocalDateTime nextAttempt = now.plus(retryDelay == null ? Duration.ofMinutes(1) : retryDelay);
        ingestionJobMapper.finishAttempt(job.getId(), KnowledgeIngestionJobEntity.PENDING,
                attempt, nextAttempt, message, now);
        log.warn("knowledge ingestion scheduled for retry, jobId={}, attempt={}, reason={}",
                job.getId(), attempt, message);
    }

    private String safeError(Exception exception) {
        if (exception == null) {
            return "knowledge ingestion failed";
        }
        String message = exception.getMessage();
        String safe = hasText(message) ? message.trim() : exception.getClass().getSimpleName();
        return safe.length() <= 1_000 ? safe : safe.substring(0, 1_000);
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
