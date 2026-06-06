package com.aetherflow.workflow.knowledge.service;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DatasetCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDatasetSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDocumentSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;

import java.util.List;

public interface KnowledgeService {

    PageResult<KnowledgeDatasetSummary> listDatasets(String query, String status, int page, int pageSize);

    KnowledgeDatasetSummary createDataset(DatasetCreateRequest request);

    KnowledgeDatasetSummary getDataset(Long datasetId);

    void deleteDataset(Long datasetId);

    PageResult<KnowledgeDocumentSummary> listDocuments(Long datasetId, int page, int pageSize);

    KnowledgeDocumentSummary createDocument(Long datasetId, DocumentCreateRequest request);

    List<KnowledgeChunkSummary> listDocumentChunks(Long documentId);

    RetrievalTestResponse runRetrievalTest(Long datasetId, RetrievalTestRequest request);
}
