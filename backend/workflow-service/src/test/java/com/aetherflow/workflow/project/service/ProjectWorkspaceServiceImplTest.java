package com.aetherflow.workflow.project.service;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectStats;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectUpdateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceSummary;
import com.aetherflow.workflow.project.entity.ProjectEntity;
import com.aetherflow.workflow.project.entity.WorkspaceEntity;
import com.aetherflow.workflow.project.mapper.ProjectMapper;
import com.aetherflow.workflow.project.mapper.WorkspaceMapper;
import com.aetherflow.workflow.project.service.impl.ProjectWorkspaceServiceImpl;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;

@ExtendWith(MockitoExtension.class)
class ProjectWorkspaceServiceImplTest {

    @Mock
    private ProjectMapper projectMapper;

    @Mock
    private WorkspaceMapper workspaceMapper;

    private ProjectWorkspaceServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new ProjectWorkspaceServiceImpl(projectMapper, workspaceMapper);
    }

    @Test
    void createsWorkspaceWithDefaults() {
        WorkspaceCreateRequest request = new WorkspaceCreateRequest();
        request.setName("AetherFlow Lab");
        request.setSlug("aetherflow-lab");
        doAnswer(invocation -> {
            WorkspaceEntity entity = invocation.getArgument(0);
            entity.setId(5L);
            return 1;
        }).when(workspaceMapper).insert(any(WorkspaceEntity.class));

        WorkspaceSummary response = asUser(7L, () -> service.createWorkspace(request));

        assertThat(response.id()).isEqualTo("5");
        assertThat(response.name()).isEqualTo("AetherFlow Lab");
        assertThat(response.environment()).isEqualTo("dev");
        assertThat(response.defaultTimeoutMin()).isEqualTo(45);
        ArgumentCaptor<WorkspaceEntity> entityCaptor = ArgumentCaptor.forClass(WorkspaceEntity.class);
        verify(workspaceMapper).insert(entityCaptor.capture());
        assertThat(entityCaptor.getValue().getOwnerUserId()).isEqualTo(7L);
        assertThat(entityCaptor.getValue().getMemberCount()).isEqualTo(1);
        assertThat(entityCaptor.getValue().getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void createsProjectWithWorkspaceContextAndFrontendDefaults() {
        when(workspaceMapper.selectById(5L)).thenReturn(workspace());
        ProjectCreateRequest request = new ProjectCreateRequest();
        request.setWorkspaceId(5L);
        request.setName("Media Ops Lab");
        request.setDescription("Audio/video workflow automation");
        request.setScenario("media");
        doAnswer(invocation -> {
            ProjectEntity entity = invocation.getArgument(0);
            entity.setId(7L);
            return 1;
        }).when(projectMapper).insert(any(ProjectEntity.class));

        ProjectSummary response = asUser(7L, () -> service.createProject(request));

        assertThat(response.id()).isEqualTo("7");
        assertThat(response.workspaceId()).isEqualTo(5L);
        assertThat(response.workspaceName()).isEqualTo("AetherFlow Lab");
        assertThat(response.environment()).isEqualTo("dev");
        assertThat(response.health()).isEqualTo("healthy");
        assertThat(response.lastRunStatus()).isEqualTo("queued");
        assertThat(response.workflows()).isEmpty();
        verify(projectMapper).insert(any(ProjectEntity.class));
    }

    @Test
    void rejectsWorkspaceOwnedByAnotherUserWhenCreatingProject() {
        WorkspaceEntity workspace = workspace();
        workspace.setOwnerUserId(99L);
        when(workspaceMapper.selectById(5L)).thenReturn(workspace);
        ProjectCreateRequest request = new ProjectCreateRequest();
        request.setWorkspaceId(5L);
        request.setName("Media Ops Lab");

        assertThatThrownBy(() -> asUser(7L, () -> service.createProject(request)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workspace not found");
    }

    @Test
    void listsProjectsUsingPagedQuery() {
        Page<ProjectEntity> page = new Page<>(1, 20);
        page.setRecords(List.of(project()));
        page.setTotal(1);
        when(projectMapper.selectPage(any(IPage.class), any())).thenReturn(page);

        PageResult<ProjectSummary> result = asUser(7L, () -> service.listProjects("media", 5L, "ACTIVE", 1, 20));

        assertThat(result.getPageNo()).isEqualTo(1);
        assertThat(result.getPageSize()).isEqualTo(20);
        assertThat(result.getTotal()).isEqualTo(1);
        assertThat(result.getRecords()).extracting(ProjectSummary::name).containsExactly("Media Ops Lab");
        verify(projectMapper).selectPage(any(IPage.class), any());
    }

    @Test
    void updatesProjectAndReturnsLatestState() {
        ProjectEntity existing = project();
        when(projectMapper.selectById(7L)).thenReturn(existing);
        ProjectUpdateRequest request = new ProjectUpdateRequest();
        request.setName("Updated Media Lab");
        request.setQueueDepth(5);

        ProjectSummary response = asUser(7L, () -> service.updateProject(7L, request));

        assertThat(response.name()).isEqualTo("Updated Media Lab");
        assertThat(response.queueDepth()).isEqualTo(5);
        ArgumentCaptor<ProjectEntity> entityCaptor = ArgumentCaptor.forClass(ProjectEntity.class);
        verify(projectMapper).updateById(entityCaptor.capture());
        assertThat(entityCaptor.getValue().getUpdatedAt()).isNotNull();
    }

    @Test
    void returnsProjectStatsFromStoredCounters() {
        when(projectMapper.selectById(7L)).thenReturn(project());

        ProjectStats stats = asUser(7L, () -> service.getProjectStats(7L));

        assertThat(stats.projectId()).isEqualTo("7");
        assertThat(stats.workflowCount()).isEqualTo(3);
        assertThat(stats.activeRunCount()).isEqualTo(1);
        assertThat(stats.fileCount()).isEqualTo(18);
        assertThat(stats.lastRunStatus()).isEqualTo("running");
    }

    @Test
    void aggregatesProjectWorkflowAndRunSummaryFromWorkflowTables() {
        WorkflowDefinitionMapper definitionMapper = mock(WorkflowDefinitionMapper.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        ProjectWorkspaceServiceImpl aggregateService = new ProjectWorkspaceServiceImpl(
                projectMapper, workspaceMapper, definitionMapper, instanceMapper);
        WorkflowDefinition first = definition(11L, "Media digest", "ENABLED", 7L,
                LocalDateTime.parse("2026-08-10T10:00:00"));
        WorkflowDefinition second = definition(12L, "Notify owner", "ENABLED", 7L,
                LocalDateTime.parse("2026-08-09T10:00:00"));
        when(projectMapper.selectById(7L)).thenReturn(project());
        when(definitionMapper.selectList(any())).thenReturn(List.of(first, second));
        when(instanceMapper.selectList(any())).thenReturn(List.of(
                instance(101L, 11L, "RUNNING", "2026-08-10T11:00:00"),
                instance(102L, 11L, "RETRYING", "2026-08-10T11:05:00"),
                instance(103L, 12L, "SUCCESS", "2026-08-10T09:00:00")));

        ProjectStats stats = asUser(7L, () -> aggregateService.getProjectStats(7L));
        ProjectSummary summary = asUser(7L, () -> aggregateService.getProject(7L));

        assertThat(stats.workflowCount()).isEqualTo(2);
        assertThat(stats.activeRunCount()).isEqualTo(2);
        assertThat(stats.queueDepth()).isEqualTo(1);
        assertThat(stats.lastRunStatus()).isEqualTo("retrying");
        assertThat(summary.workflows()).extracting(item -> item.id()).containsExactly("11", "12");
        assertThat(summary.workflowCount()).isEqualTo(2);
    }

    @Test
    void throwsNotFoundWhenProjectIsMissing() {
        when(projectMapper.selectById(404L)).thenReturn(null);

        assertThatThrownBy(() -> asUser(7L, () -> service.getProject(404L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("project not found");
    }

    @Test
    void rejectsProjectOwnedByAnotherUser() {
        ProjectEntity project = project();
        project.setOwnerUserId(99L);
        when(projectMapper.selectById(7L)).thenReturn(project);

        assertThatThrownBy(() -> asUser(7L, () -> service.getProject(7L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("project not found");
    }

    private static WorkspaceEntity workspace() {
        WorkspaceEntity workspace = new WorkspaceEntity();
        workspace.setId(5L);
        workspace.setName("AetherFlow Lab");
        workspace.setSlug("aetherflow-lab");
        workspace.setRegion("cn-east");
        workspace.setEnvironment("dev");
        workspace.setOwnerUserId(7L);
        workspace.setOwnerName("aether.operator");
        workspace.setMemberCount(4);
        workspace.setDefaultTimeoutMin(45);
        workspace.setRetentionDays(30);
        workspace.setStatus("ACTIVE");
        workspace.setUpdatedAt(LocalDateTime.parse("2026-05-29T10:00:00"));
        return workspace;
    }

    private static ProjectEntity project() {
        ProjectEntity project = new ProjectEntity();
        project.setId(7L);
        project.setWorkspaceId(5L);
        project.setWorkspaceName("AetherFlow Lab");
        project.setName("Media Ops Lab");
        project.setDescription("Audio/video workflow automation");
        project.setOwnerName("aether.operator");
        project.setOwnerUserId(7L);
        project.setEnvironment("dev");
        project.setHealth("healthy");
        project.setScenario("media");
        project.setSlaTarget("< 8 min");
        project.setQueueDepth(3);
        project.setKnowledgeCount(2);
        project.setLastRunStatus("running");
        project.setWorkflowCount(3);
        project.setActiveRunCount(1);
        project.setFileCount(18);
        project.setStatus("ACTIVE");
        project.setUpdatedAt(LocalDateTime.parse("2026-05-29T10:00:00"));
        return project;
    }

    private static WorkflowDefinition definition(Long id, String name, String status, Long projectId, LocalDateTime updatedAt) {
        WorkflowDefinition definition = new WorkflowDefinition();
        definition.setId(id);
        definition.setName(name);
        definition.setStatus(status);
        definition.setProjectId(projectId);
        definition.setOwnerUserId(7L);
        definition.setUpdatedAt(updatedAt);
        return definition;
    }

    private static WorkflowInstance instance(Long id, Long definitionId, String status, String updatedAt) {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(id);
        instance.setDefinitionId(definitionId);
        instance.setUserId(7L);
        instance.setStatus(status);
        instance.setUpdatedAt(LocalDateTime.parse(updatedAt));
        return instance;
    }

    private static <T> T asUser(Long userId, Supplier<T> action) {
        return AuthenticatedUserContext.runAs(userId, "aether.operator", action);
    }
}
