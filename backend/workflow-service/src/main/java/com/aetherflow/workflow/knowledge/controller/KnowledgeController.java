package com.aetherflow.workflow.knowledge.controller;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DatasetCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDatasetSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDocumentSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/knowledge")
@RequiredArgsConstructor
public class KnowledgeController {

    private final KnowledgeService knowledgeService;

    @GetMapping("/datasets")
    public Result<PageResult<KnowledgeDatasetSummary>> listDatasets(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(knowledgeService.listDatasets(query, status, page, pageSize));
    }

    @PostMapping("/datasets")
    public Result<KnowledgeDatasetSummary> createDataset(@Valid @RequestBody DatasetCreateRequest request) {
        return Result.success(knowledgeService.createDataset(request));
    }

    @GetMapping("/datasets/{id}")
    public Result<KnowledgeDatasetSummary> getDataset(@PathVariable Long id) {
        return Result.success(knowledgeService.getDataset(id));
    }

    @DeleteMapping("/datasets/{id}")
    public Result<Void> deleteDataset(@PathVariable Long id) {
        knowledgeService.deleteDataset(id);
        return Result.success();
    }

    @GetMapping("/datasets/{id}/documents")
    public Result<PageResult<KnowledgeDocumentSummary>> listDocuments(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(knowledgeService.listDocuments(id, page, pageSize));
    }

    @PostMapping("/datasets/{id}/documents")
    public Result<KnowledgeDocumentSummary> createDocument(@PathVariable Long id,
                                                           @RequestBody DocumentCreateRequest request) {
        return Result.success(knowledgeService.createDocument(id, request));
    }

    @GetMapping("/documents/{id}/chunks")
    public Result<List<KnowledgeChunkSummary>> listDocumentChunks(@PathVariable Long id) {
        return Result.success(knowledgeService.listDocumentChunks(id));
    }

    @PostMapping("/datasets/{id}/retrieval-test")
    public Result<RetrievalTestResponse> runRetrievalTest(@PathVariable Long id,
                                                          @RequestBody RetrievalTestRequest request) {
        return Result.success(knowledgeService.runRetrievalTest(id, request));
    }
}
