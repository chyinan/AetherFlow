package com.aetherflow.workflow.project.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

public final class ProjectWorkspaceDtos {

    private ProjectWorkspaceDtos() {
    }

    @Data
    @Schema(description = "Create project request.")
    public static class ProjectCreateRequest {
        @NotBlank
        @Size(max = 128)
        private String name;
        @Size(max = 512)
        private String description;
        private Long workspaceId;
        private Long ownerUserId;
        @Size(max = 128)
        private String ownerName;
        @Size(max = 32)
        private String environment;
        @Size(max = 32)
        private String health;
        @Size(max = 32)
        private String scenario;
        @Size(max = 64)
        private String slaTarget;
        private Integer queueDepth;
        private Integer knowledgeCount;
        @Size(max = 32)
        private String lastRunStatus;
        private Integer workflowCount;
        private Integer activeRunCount;
        private Integer fileCount;
    }

    @Data
    @Schema(description = "Update project request. Null fields are ignored.")
    public static class ProjectUpdateRequest {
        @Size(max = 128)
        private String name;
        @Size(max = 512)
        private String description;
        private Long workspaceId;
        private Long ownerUserId;
        @Size(max = 128)
        private String ownerName;
        @Size(max = 32)
        private String environment;
        @Size(max = 32)
        private String health;
        @Size(max = 32)
        private String scenario;
        @Size(max = 64)
        private String slaTarget;
        private Integer queueDepth;
        private Integer knowledgeCount;
        @Size(max = 32)
        private String lastRunStatus;
        private Integer workflowCount;
        private Integer activeRunCount;
        private Integer fileCount;
        @Size(max = 32)
        private String status;
    }

    @Data
    @Schema(description = "Create workspace request.")
    public static class WorkspaceCreateRequest {
        @NotBlank
        @Size(max = 128)
        private String name;
        @Size(max = 128)
        private String slug;
        @Size(max = 64)
        private String region;
        @Size(max = 32)
        private String environment;
        private Long ownerUserId;
        @Size(max = 128)
        private String ownerName;
        private Integer memberCount;
        private Integer defaultTimeoutMin;
        private Integer retentionDays;
    }

    @Data
    @Schema(description = "Update workspace request. Null fields are ignored.")
    public static class WorkspaceUpdateRequest {
        @Size(max = 128)
        private String name;
        @Size(max = 128)
        private String slug;
        @Size(max = 64)
        private String region;
        @Size(max = 32)
        private String environment;
        private Long ownerUserId;
        @Size(max = 128)
        private String ownerName;
        private Integer memberCount;
        private Integer defaultTimeoutMin;
        private Integer retentionDays;
        @Size(max = 32)
        private String status;
    }

    @Schema(description = "Frontend-shaped project summary.")
    public record ProjectSummary(
            String id,
            Long workspaceId,
            String workspaceName,
            String name,
            String description,
            String owner,
            String environment,
            String health,
            String scenario,
            String slaTarget,
            Integer queueDepth,
            Integer knowledgeCount,
            String lastRunStatus,
            Integer workflowCount,
            Integer activeRunCount,
            Integer fileCount,
            String updatedAt,
            List<ProjectWorkflowLink> workflows
    ) {
    }

    @Schema(description = "Project workflow link shown by the project dashboard.")
    public record ProjectWorkflowLink(
            String id,
            String name,
            String status,
            String updatedAt
    ) {
    }

    @Schema(description = "Project statistics response.")
    public record ProjectStats(
            String projectId,
            Integer workflowCount,
            Integer activeRunCount,
            Integer fileCount,
            Integer knowledgeCount,
            Integer queueDepth,
            String lastRunStatus,
            String updatedAt
    ) {
    }

    @Schema(description = "Workspace summary response.")
    public record WorkspaceSummary(
            String id,
            String name,
            String slug,
            String region,
            String environment,
            String owner,
            Integer memberCount,
            Integer defaultTimeoutMin,
            Integer retentionDays,
            String updatedAt
    ) {
    }
}
