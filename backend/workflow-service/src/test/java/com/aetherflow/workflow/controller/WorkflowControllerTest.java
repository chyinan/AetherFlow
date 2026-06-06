package com.aetherflow.workflow.controller;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.importer.ComfyUiWorkflowImportService;
import com.aetherflow.workflow.service.WorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class WorkflowControllerTest {

    @Mock
    private WorkflowService workflowService;

    @Mock
    private ComfyUiWorkflowImportService comfyUiWorkflowImportService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new WorkflowController(workflowService, comfyUiWorkflowImportService)).build();
    }

    @Test
    void listsWorkflowDefinitions() throws Exception {
        when(workflowService.listDefinitions()).thenReturn(List.of(definition(10L, "Daily digest")));

        mockMvc.perform(get("/workflows/definitions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data[0].id").value(10))
                .andExpect(jsonPath("$.data[0].name").value("Daily digest"));
    }

    @Test
    void returnsWorkflowDefinitionDetail() throws Exception {
        when(workflowService.getDefinition(10L)).thenReturn(definition(10L, "Daily digest"));

        mockMvc.perform(get("/workflows/definitions/10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").value(10))
                .andExpect(jsonPath("$.data.definitionJson").value("{}"));
    }

    @Test
    void updatesWorkflowDefinition() throws Exception {
        when(workflowService.updateDefinition(eq(10L), any(WorkflowDefinitionDTO.class)))
                .thenReturn(definition(10L, "Updated digest"));

        mockMvc.perform(put("/workflows/definitions/10")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(definitionRequest("Updated digest"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").value(10))
                .andExpect(jsonPath("$.data.name").value("Updated digest"));

        verify(workflowService).updateDefinition(eq(10L), any(WorkflowDefinitionDTO.class));
    }

    @Test
    void importsComfyUiWorkflowDefinition() throws Exception {
        WorkflowDefinitionDTO imported = definitionRequest("Imported ComfyUI");
        imported.getNodes().get(0).setNodeType("IMAGE_GENERATION");
        when(comfyUiWorkflowImportService.importWorkflow(eq("Imported ComfyUI"), eq("demo"), eq(12L), any()))
                .thenReturn(imported);

        mockMvc.perform(post("/workflows/definitions/import/comfyui")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", "Imported ComfyUI",
                                "description", "demo",
                                "projectId", 12,
                                "workflowJson", Map.of("1", Map.of("class_type", "KSampler"))
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.name").value("Imported ComfyUI"))
                .andExpect(jsonPath("$.data.nodes[0].nodeType").value("IMAGE_GENERATION"));

        verify(comfyUiWorkflowImportService).importWorkflow(eq("Imported ComfyUI"), eq("demo"), eq(12L), any());
    }

    @Test
    void deletesWorkflowDefinition() throws Exception {
        mockMvc.perform(delete("/workflows/definitions/10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        verify(workflowService).deleteDefinition(10L);
    }

    private static WorkflowDefinition definition(Long id, String name) {
        WorkflowDefinition definition = new WorkflowDefinition();
        definition.setId(id);
        definition.setName(name);
        definition.setDescription("demo");
        definition.setDefinitionJson("{}");
        definition.setVersion(1);
        definition.setStatus("ENABLED");
        return definition;
    }

    private static WorkflowDefinitionDTO definitionRequest(String name) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId("node-start");
        node.setNodeType("MOCK");
        node.setDisplayName("Start");
        node.setConfig(Map.of());

        WorkflowDefinitionDTO request = new WorkflowDefinitionDTO();
        request.setName(name);
        request.setDescription("demo");
        request.setNodes(List.of(node));
        return request;
    }
}
