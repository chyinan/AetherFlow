package com.aetherflow.workflow.project.service;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectStats;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectUpdateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceUpdateRequest;

public interface ProjectWorkspaceService {

    PageResult<ProjectSummary> listProjects(String query, Long workspaceId, String status, int page, int size);

    ProjectSummary createProject(ProjectCreateRequest request);

    ProjectSummary getProject(Long id);

    ProjectSummary updateProject(Long id, ProjectUpdateRequest request);

    void deleteProject(Long id);

    ProjectStats getProjectStats(Long id);

    PageResult<WorkspaceSummary> listWorkspaces(String query, int page, int size);

    WorkspaceSummary createWorkspace(WorkspaceCreateRequest request);

    WorkspaceSummary getWorkspace(Long id);

    WorkspaceSummary updateWorkspace(Long id, WorkspaceUpdateRequest request);

    void deleteWorkspace(Long id);
}
