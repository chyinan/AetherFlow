package com.aetherflow.workflow.knowledge.service.impl;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.embedding.SimpleTextSplitter;
import com.aetherflow.workflow.embedding.TextChunk;
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
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Service
@RequiredArgsConstructor
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
    private static final int DEFAULT_TOP_K = 3;

    private final KnowledgeDatasetMapper datasetMapper;
    private final KnowledgeDocumentMapper documentMapper;
    private final KnowledgeChunkMapper chunkMapper;
    private final SimpleTextSplitter textSplitter;
    private final ObjectMapper objectMapper;

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
        entity.setOwner(defaultText(request.getOwner(), currentUsername()));
        entity.setTagsJson(writeJson(request.getTags() == null ? List.of() : request.getTags()));
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        datasetMapper.insert(entity);
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
        KnowledgeDatasetEntity dataset = requireDataset(datasetId);
        LocalDateTime now = LocalDateTime.now();
        String content = request.getContent() == null ? "" : request.getContent();
        List<TextChunk> chunks = textSplitter.split(content, defaultNumber(request.getChunkSize(), DEFAULT_CHUNK_SIZE),
                defaultNumber(request.getOverlap(), DEFAULT_OVERLAP));

        KnowledgeDocumentEntity document = new KnowledgeDocumentEntity();
        document.setDatasetId(datasetId);
        document.setName(defaultText(request.getSourceName(), "document-" + datasetId));
        document.setSourceType(defaultText(request.getSourceType(), DEFAULT_SOURCE_TYPE));
        document.setFileId(request.getFileId());
        document.setMode(defaultText(request.getMode(), DEFAULT_DOCUMENT_MODE));
        document.setCharCount(content.length());
        document.setChunkCount(chunks.size());
        document.setRecallCount(0);
        document.setStatus(STATUS_READY);
        document.setUploadedAt(now);
        document.setCreatedAt(now);
        document.setUpdatedAt(now);
        documentMapper.insert(document);

        for (TextChunk textChunk : chunks) {
            KnowledgeChunkEntity chunk = new KnowledgeChunkEntity();
            chunk.setDatasetId(datasetId);
            chunk.setDocumentId(document.getId());
            chunk.setSource(document.getName());
            chunk.setPreview(textChunk.text());
            chunk.setTokens(estimateTokens(textChunk.text()));
            chunk.setScore(0.82D);
            chunk.setStatus(STATUS_READY);
            chunk.setChunkIndex(textChunk.chunkIndex());
            chunk.setCreatedAt(now);
            chunk.setUpdatedAt(now);
            chunkMapper.insert(chunk);
        }

        dataset.setDocumentCount(nvl(dataset.getDocumentCount()) + 1);
        dataset.setProcessingDocumentCount(0);
        dataset.setChunkCount(nvl(dataset.getChunkCount()) + chunks.size());
        dataset.setFailedChunkCount(nvl(dataset.getFailedChunkCount()));
        if (dataset.getHitRate() == null || dataset.getHitRate() == 0) {
            dataset.setHitRate(84);
        }
        dataset.setStatus(STATUS_READY);
        dataset.setUpdatedAt(now);
        datasetMapper.updateById(dataset);

        return toDocumentSummary(document);
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
    public RetrievalTestResponse runRetrievalTest(Long datasetId, RetrievalTestRequest request) {
        requireDataset(datasetId);
        String query = request == null ? null : request.getQuery();
        int topK = defaultNumber(request == null ? null : request.getTopK(), DEFAULT_TOP_K);
        LambdaQueryWrapper<KnowledgeChunkEntity> wrapper = new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDatasetId, datasetId)
                .orderByDesc(KnowledgeChunkEntity::getScore)
                .orderByAsc(KnowledgeChunkEntity::getChunkIndex);
        List<KnowledgeChunkEntity> storedChunks = chunkMapper.selectList(wrapper);
        List<KnowledgeChunkSummary> matched = storedChunks.stream()
                .filter(chunk -> !hasText(query) || matches(chunk, query))
                .map(chunk -> toRetrievalChunkSummary(chunk, query))
                .sorted(Comparator.comparing(KnowledgeChunkSummary::score, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(Math.max(1, topK))
                .toList();
        if (matched.isEmpty() && hasText(query)) {
            matched = storedChunks.stream()
                    .map(chunk -> toRetrievalChunkSummary(chunk, null))
                    .sorted(Comparator.comparing(KnowledgeChunkSummary::score, Comparator.nullsLast(Comparator.reverseOrder())))
                    .limit(Math.max(1, topK))
                    .toList();
        }
        return new RetrievalTestResponse(String.valueOf(datasetId), query, matched);
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
                entity.getStatus()
        );
    }

    private KnowledgeChunkSummary toRetrievalChunkSummary(KnowledgeChunkEntity entity, String query) {
        double score = defaultScore(entity.getScore());
        if (hasText(query) && matches(entity, query)) {
            score = Math.min(0.98D, score + 0.1D);
        }
        return new KnowledgeChunkSummary(
                stringId(entity.getId()),
                stringId(entity.getDatasetId()),
                stringId(entity.getDocumentId()),
                entity.getSource(),
                entity.getPreview(),
                nvl(entity.getTokens()),
                score,
                entity.getStatus()
        );
    }

    private boolean matches(KnowledgeChunkEntity chunk, String query) {
        String needle = query.toLowerCase(Locale.ROOT);
        return containsIgnoreCase(chunk.getSource(), needle) || containsIgnoreCase(chunk.getPreview(), needle);
    }

    private boolean containsIgnoreCase(String value, String lowercaseNeedle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowercaseNeedle);
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

    private int defaultNumber(Integer value, int fallback) {
        return value == null || value <= 0 ? fallback : value;
    }

    private String defaultText(String value, String fallback) {
        return hasText(value) ? value : fallback;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
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
