package com.aetherflow.workflow.knowledge.controller;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DatasetCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.DocumentCreateRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDatasetSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeDocumentSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class KnowledgeControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void listsDatasetsAsPagedFrontendShape() throws Exception {
        KnowledgeService service = mock(KnowledgeService.class);
        when(service.listDatasets("docs", "ready", 1, 20))
                .thenReturn(new PageResult<>(1, 20, 1, List.of(dataset())));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service)).build();

        mockMvc.perform(get("/knowledge/datasets")
                        .param("query", "docs")
                        .param("status", "ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.records[0].id").value("11"))
                .andExpect(jsonPath("$.data.records[0].tags[0]").value("docs"));

        verify(service).listDatasets("docs", "ready", 1, 20);
    }

    @Test
    void createsDatasetAndDocumentThenReturnsChunks() throws Exception {
        KnowledgeService service = mock(KnowledgeService.class);
        DatasetCreateRequest datasetRequest = new DatasetCreateRequest();
        datasetRequest.setName("Product Docs RAG");
        when(service.createDataset(datasetRequest)).thenReturn(dataset());

        DocumentCreateRequest documentRequest = new DocumentCreateRequest();
        documentRequest.setSourceName("workflow-runbook.md");
        documentRequest.setContent("Workflow apps can combine LLM nodes and knowledge retrieval.");
        when(service.createDocument(11L, documentRequest)).thenReturn(document());
        when(service.listDocumentChunks(21L)).thenReturn(List.of(chunk()));

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service)).build();

        mockMvc.perform(post("/knowledge/datasets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(datasetRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value("11"))
                .andExpect(jsonPath("$.data.name").value("Product Docs RAG"));

        mockMvc.perform(post("/knowledge/datasets/11/documents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(documentRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value("21"))
                .andExpect(jsonPath("$.data.chunkCount").value(1));

        mockMvc.perform(get("/knowledge/documents/21/chunks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].preview").value("Workflow apps can combine LLM nodes."));
    }

    @Test
    void runsRetrievalPreview() throws Exception {
        KnowledgeService service = mock(KnowledgeService.class);
        RetrievalTestRequest request = new RetrievalTestRequest();
        request.setQuery("workflow");
        request.setTopK(3);
        when(service.runRetrievalTest(11L, request)).thenReturn(new RetrievalTestResponse(
                "11", "workflow", List.of(chunk())
        ));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service)).build();

        mockMvc.perform(post("/knowledge/datasets/11/retrieval-test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.datasetId").value("11"))
                .andExpect(jsonPath("$.data.results[0].score").value(0.93D));
    }

    @Test
    void deletesDataset() throws Exception {
        KnowledgeService service = mock(KnowledgeService.class);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service)).build();

        mockMvc.perform(delete("/knowledge/datasets/11"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        verify(service).deleteDataset(11L);
    }

    private static KnowledgeDatasetSummary dataset() {
        return new KnowledgeDatasetSummary(
                "11", "Product Docs RAG", "Public docs and release notes", "ready",
                1, 0, 1, 0, 92, "nomic-embed-text", "hybrid search + rerank",
                "knowledge.ops", "2026-05-29T10:00:00", List.of("docs")
        );
    }

    private static KnowledgeDocumentSummary document() {
        return new KnowledgeDocumentSummary(
                "21", "11", "workflow-runbook.md", "file", "general",
                58, 1, 0, "2026-05-29T10:00:00", "ready"
        );
    }

    private static KnowledgeChunkSummary chunk() {
        return new KnowledgeChunkSummary(
                "31", "11", "21", "workflow-runbook.md",
                "Workflow apps can combine LLM nodes.", 146, 0.93D, "ready"
        );
    }
}
