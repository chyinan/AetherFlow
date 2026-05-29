package com.aetherflow.workflow.project.controller;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectStats;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectWorkflowLink;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceSummary;
import com.aetherflow.workflow.project.service.ProjectWorkspaceService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProjectWorkspaceControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void listsProjectsAsPagedFrontendSummaries() throws Exception {
        ProjectWorkspaceService service = mock(ProjectWorkspaceService.class);
        when(service.listProjects("media", 5L, "ACTIVE", 1, 20))
                .thenReturn(new PageResult<>(1, 20, 1, List.of(project())));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ProjectWorkspaceController(service)).build();

        mockMvc.perform(get("/projects")
                        .param("query", "media")
                        .param("workspaceId", "5")
                        .param("status", "ACTIVE")
                        .param("page", "1")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.records", hasSize(1)))
                .andExpect(jsonPath("$.data.records[0].id").value("7"))
                .andExpect(jsonPath("$.data.records[0].name").value("Media Ops Lab"))
                .andExpect(jsonPath("$.data.records[0].workflows[0].status").value("ready"));

        verify(service).listProjects("media", 5L, "ACTIVE", 1, 20);
    }

    @Test
    void createsProjectAndReturnsSummary() throws Exception {
        ProjectWorkspaceService service = mock(ProjectWorkspaceService.class);
        ProjectCreateRequest request = new ProjectCreateRequest();
        request.setWorkspaceId(5L);
        request.setName("Media Ops Lab");
        request.setScenario("media");
        when(service.createProject(request)).thenReturn(project());
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ProjectWorkspaceController(service)).build();

        mockMvc.perform(post("/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value("7"))
                .andExpect(jsonPath("$.data.scenario").value("media"))
                .andExpect(jsonPath("$.data.workflowCount").value(3));

        verify(service).createProject(request);
    }

    @Test
    void returnsProjectStats() throws Exception {
        ProjectWorkspaceService service = mock(ProjectWorkspaceService.class);
        when(service.getProjectStats(7L)).thenReturn(new ProjectStats(
                "7", 3, 1, 18, 2, 3, "running", "2026-05-29T10:00:00"
        ));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ProjectWorkspaceController(service)).build();

        mockMvc.perform(get("/projects/7/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.projectId").value("7"))
                .andExpect(jsonPath("$.data.workflowCount").value(3))
                .andExpect(jsonPath("$.data.activeRunCount").value(1))
                .andExpect(jsonPath("$.data.lastRunStatus").value("running"));
    }

    @Test
    void listsAndCreatesWorkspaces() throws Exception {
        ProjectWorkspaceService service = mock(ProjectWorkspaceService.class);
        WorkspaceSummary workspace = workspace();
        when(service.listWorkspaces("lab", 1, 20))
                .thenReturn(new PageResult<>(1, 20, 1, List.of(workspace)));
        WorkspaceCreateRequest request = new WorkspaceCreateRequest();
        request.setName("AetherFlow Lab");
        request.setSlug("aetherflow-lab");
        when(service.createWorkspace(request)).thenReturn(workspace);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ProjectWorkspaceController(service)).build();

        mockMvc.perform(get("/workspaces").param("query", "lab"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.records[0].slug").value("aetherflow-lab"));

        mockMvc.perform(post("/workspaces")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value("5"))
                .andExpect(jsonPath("$.data.memberCount").value(4));
    }

    private static ProjectSummary project() {
        return new ProjectSummary(
                "7",
                5L,
                "AetherFlow Lab",
                "Media Ops Lab",
                "Audio/video workflow automation",
                "aether.operator",
                "dev",
                "healthy",
                "media",
                "< 8 min",
                3,
                2,
                "running",
                3,
                1,
                18,
                "2026-05-29T10:00:00",
                List.of(new ProjectWorkflowLink("wf-1", "Transcribe", "ready", "2026-05-29T09:00:00"))
        );
    }

    private static WorkspaceSummary workspace() {
        return new WorkspaceSummary(
                "5",
                "AetherFlow Lab",
                "aetherflow-lab",
                "cn-east",
                "dev",
                "aether.operator",
                4,
                45,
                30,
                "2026-05-29T10:00:00"
        );
    }
}
