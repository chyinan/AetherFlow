package com.aetherflow.workflow.project.controller;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectStats;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectUpdateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceUpdateRequest;
import com.aetherflow.workflow.project.service.ProjectWorkspaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Project Workspace", description = "Project dashboard and workspace APIs.")
@RestController
@RequiredArgsConstructor
public class ProjectWorkspaceController {

    private final ProjectWorkspaceService service;

    @Operation(summary = "List projects")
    @GetMapping("/projects")
    public Result<PageResult<ProjectSummary>> listProjects(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) Long workspaceId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(service.listProjects(query, workspaceId, status, page, size));
    }

    @Operation(summary = "Create project")
    @PostMapping("/projects")
    public Result<ProjectSummary> createProject(@Valid @RequestBody ProjectCreateRequest request) {
        return Result.success(service.createProject(request));
    }

    @Operation(summary = "Get project")
    @GetMapping("/projects/{id}")
    public Result<ProjectSummary> getProject(@PathVariable Long id) {
        return Result.success(service.getProject(id));
    }

    @Operation(summary = "Update project")
    @PutMapping("/projects/{id}")
    public Result<ProjectSummary> updateProject(@PathVariable Long id,
                                                @Valid @RequestBody ProjectUpdateRequest request) {
        return Result.success(service.updateProject(id, request));
    }

    @Operation(summary = "Delete project")
    @DeleteMapping("/projects/{id}")
    public Result<Void> deleteProject(@PathVariable Long id) {
        service.deleteProject(id);
        return Result.success();
    }

    @Operation(summary = "Get project stats")
    @GetMapping("/projects/{id}/stats")
    public Result<ProjectStats> getProjectStats(@PathVariable Long id) {
        return Result.success(service.getProjectStats(id));
    }

    @Operation(summary = "List workspaces")
    @GetMapping("/workspaces")
    public Result<PageResult<WorkspaceSummary>> listWorkspaces(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(service.listWorkspaces(query, page, size));
    }

    @Operation(summary = "Create workspace")
    @PostMapping("/workspaces")
    public Result<WorkspaceSummary> createWorkspace(@Valid @RequestBody WorkspaceCreateRequest request) {
        return Result.success(service.createWorkspace(request));
    }

    @Operation(summary = "Get workspace")
    @GetMapping("/workspaces/{id}")
    public Result<WorkspaceSummary> getWorkspace(@PathVariable Long id) {
        return Result.success(service.getWorkspace(id));
    }

    @Operation(summary = "Update workspace")
    @PutMapping("/workspaces/{id}")
    public Result<WorkspaceSummary> updateWorkspace(@PathVariable Long id,
                                                    @Valid @RequestBody WorkspaceUpdateRequest request) {
        return Result.success(service.updateWorkspace(id, request));
    }

    @Operation(summary = "Delete workspace")
    @DeleteMapping("/workspaces/{id}")
    public Result<Void> deleteWorkspace(@PathVariable Long id) {
        service.deleteWorkspace(id);
        return Result.success();
    }
}
