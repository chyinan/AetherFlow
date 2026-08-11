package com.aetherflow.workflow.project.service.impl;

import com.aetherflow.common.core.PageResult;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectStats;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectWorkflowLink;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.ProjectUpdateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceCreateRequest;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceSummary;
import com.aetherflow.workflow.project.dto.ProjectWorkspaceDtos.WorkspaceUpdateRequest;
import com.aetherflow.workflow.project.entity.ProjectEntity;
import com.aetherflow.workflow.project.entity.WorkspaceEntity;
import com.aetherflow.workflow.project.mapper.ProjectMapper;
import com.aetherflow.workflow.project.mapper.WorkspaceMapper;
import com.aetherflow.workflow.project.service.ProjectWorkspaceService;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class ProjectWorkspaceServiceImpl implements ProjectWorkspaceService {

    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String STATUS_DELETED = "DELETED";
    private static final String DEFAULT_ENVIRONMENT = "dev";
    private static final String DEFAULT_HEALTH = "healthy";
    private static final String DEFAULT_SCENARIO = "media";
    private static final String DEFAULT_LAST_RUN_STATUS = "queued";
    private static final String DEFAULT_OWNER = "aether.operator";
    private static final String DEFAULT_REGION = "cn-east";
    private static final int DEFAULT_TIMEOUT_MIN = 45;
    private static final int DEFAULT_RETENTION_DAYS = 30;
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final ProjectMapper projectMapper;
    private final WorkspaceMapper workspaceMapper;
    private final WorkflowDefinitionMapper workflowDefinitionMapper;
    private final WorkflowInstanceMapper workflowInstanceMapper;

    public ProjectWorkspaceServiceImpl(ProjectMapper projectMapper, WorkspaceMapper workspaceMapper) {
        this(projectMapper, workspaceMapper, null, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ProjectWorkspaceServiceImpl(ProjectMapper projectMapper,
                                       WorkspaceMapper workspaceMapper,
                                       WorkflowDefinitionMapper workflowDefinitionMapper,
                                       WorkflowInstanceMapper workflowInstanceMapper) {
        this.projectMapper = projectMapper;
        this.workspaceMapper = workspaceMapper;
        this.workflowDefinitionMapper = workflowDefinitionMapper;
        this.workflowInstanceMapper = workflowInstanceMapper;
    }

    @Override
    public PageResult<ProjectSummary> listProjects(String query, Long workspaceId, String status, int page, int size) {
        Long userId = currentUserId();
        IPage<ProjectEntity> result = projectMapper.selectPage(new Page<>(pageNo(page), pageSize(size)),
                projectQuery(userId, query, workspaceId, status));
        List<ProjectSummary> records = result.getRecords().stream()
                .map(this::toProjectSummary)
                .toList();
        return new PageResult<>(result.getCurrent(), result.getSize(), result.getTotal(), records);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ProjectSummary createProject(ProjectCreateRequest request) {
        requireName(request == null ? null : request.getName(), "project name is required");
        Long userId = currentUserId();
        WorkspaceEntity workspace = request.getWorkspaceId() == null ? null : requireWorkspace(request.getWorkspaceId());
        LocalDateTime now = LocalDateTime.now();

        ProjectEntity entity = new ProjectEntity();
        entity.setWorkspaceId(request.getWorkspaceId());
        entity.setWorkspaceName(workspace == null ? null : workspace.getName());
        entity.setName(request.getName().trim());
        entity.setDescription(trimToNull(request.getDescription()));
        entity.setOwnerUserId(userId);
        entity.setOwnerName(defaultString(request.getOwnerName(),
                workspace == null ? currentUsername() : workspace.getOwnerName(), currentUsername()));
        entity.setEnvironment(defaultString(request.getEnvironment(),
                workspace == null ? DEFAULT_ENVIRONMENT : workspace.getEnvironment(), DEFAULT_ENVIRONMENT));
        entity.setHealth(defaultString(request.getHealth(), DEFAULT_HEALTH));
        entity.setScenario(defaultString(request.getScenario(), DEFAULT_SCENARIO));
        entity.setSlaTarget(defaultString(request.getSlaTarget(), "< 8 min"));
        entity.setQueueDepth(defaultInt(request.getQueueDepth()));
        entity.setKnowledgeCount(defaultInt(request.getKnowledgeCount()));
        entity.setLastRunStatus(defaultString(request.getLastRunStatus(), DEFAULT_LAST_RUN_STATUS));
        entity.setWorkflowCount(defaultInt(request.getWorkflowCount()));
        entity.setActiveRunCount(defaultInt(request.getActiveRunCount()));
        entity.setFileCount(defaultInt(request.getFileCount()));
        entity.setStatus(STATUS_ACTIVE);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        projectMapper.insert(entity);
        return toProjectSummary(entity);
    }

    @Override
    public ProjectSummary getProject(Long id) {
        return toProjectSummary(requireProject(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ProjectSummary updateProject(Long id, ProjectUpdateRequest request) {
        ProjectEntity entity = requireProject(id);
        if (request == null) {
            return toProjectSummary(entity);
        }
        if (hasText(request.getName())) {
            entity.setName(request.getName().trim());
        }
        if (request.getDescription() != null) {
            entity.setDescription(trimToNull(request.getDescription()));
        }
        if (request.getWorkspaceId() != null) {
            WorkspaceEntity workspace = requireWorkspace(request.getWorkspaceId());
            entity.setWorkspaceId(workspace.getId());
            entity.setWorkspaceName(workspace.getName());
            if (!hasText(request.getEnvironment())) {
                entity.setEnvironment(workspace.getEnvironment());
            }
        }
        entity.setOwnerUserId(currentUserId());
        entity.setOwnerName(defaultString(request.getOwnerName(), currentUsername()));
        setIfText(request.getEnvironment(), entity::setEnvironment);
        setIfText(request.getHealth(), entity::setHealth);
        setIfText(request.getScenario(), entity::setScenario);
        setIfText(request.getSlaTarget(), entity::setSlaTarget);
        if (request.getQueueDepth() != null) {
            entity.setQueueDepth(nonNegative(request.getQueueDepth()));
        }
        if (request.getKnowledgeCount() != null) {
            entity.setKnowledgeCount(nonNegative(request.getKnowledgeCount()));
        }
        setIfText(request.getLastRunStatus(), entity::setLastRunStatus);
        if (request.getWorkflowCount() != null) {
            entity.setWorkflowCount(nonNegative(request.getWorkflowCount()));
        }
        if (request.getActiveRunCount() != null) {
            entity.setActiveRunCount(nonNegative(request.getActiveRunCount()));
        }
        if (request.getFileCount() != null) {
            entity.setFileCount(nonNegative(request.getFileCount()));
        }
        setIfText(request.getStatus(), entity::setStatus);
        entity.setUpdatedAt(LocalDateTime.now());
        projectMapper.updateById(entity);
        return toProjectSummary(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteProject(Long id) {
        ProjectEntity entity = requireProject(id);
        entity.setStatus(STATUS_DELETED);
        entity.setUpdatedAt(LocalDateTime.now());
        projectMapper.updateById(entity);
        retireProjectWorkflows(entity.getId());
    }

    @Override
    public ProjectStats getProjectStats(Long id) {
        ProjectEntity entity = requireProject(id);
        ProjectTelemetry telemetry = telemetry(entity);
        return new ProjectStats(
                String.valueOf(entity.getId()),
                telemetry.workflowCount(),
                telemetry.activeRunCount(),
                safeInt(entity.getFileCount()),
                safeInt(entity.getKnowledgeCount()),
                telemetry.queueDepth(),
                telemetry.lastRunStatus(),
                formatTime(telemetry.updatedAt())
        );
    }

    @Override
    public PageResult<WorkspaceSummary> listWorkspaces(String query, int page, int size) {
        Long userId = currentUserId();
        IPage<WorkspaceEntity> result = workspaceMapper.selectPage(new Page<>(pageNo(page), pageSize(size)),
                workspaceQuery(userId, query));
        List<WorkspaceSummary> records = result.getRecords().stream()
                .map(this::toWorkspaceSummary)
                .toList();
        return new PageResult<>(result.getCurrent(), result.getSize(), result.getTotal(), records);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkspaceSummary createWorkspace(WorkspaceCreateRequest request) {
        requireName(request == null ? null : request.getName(), "workspace name is required");
        Long userId = currentUserId();
        LocalDateTime now = LocalDateTime.now();
        WorkspaceEntity entity = new WorkspaceEntity();
        entity.setName(request.getName().trim());
        entity.setSlug(defaultString(request.getSlug(), slugify(request.getName())));
        entity.setRegion(defaultString(request.getRegion(), DEFAULT_REGION));
        entity.setEnvironment(defaultString(request.getEnvironment(), DEFAULT_ENVIRONMENT));
        entity.setOwnerUserId(userId);
        entity.setOwnerName(defaultString(request.getOwnerName(), currentUsername()));
        entity.setMemberCount(defaultPositive(request.getMemberCount(), 1));
        entity.setDefaultTimeoutMin(defaultPositive(request.getDefaultTimeoutMin(), DEFAULT_TIMEOUT_MIN));
        entity.setRetentionDays(defaultPositive(request.getRetentionDays(), DEFAULT_RETENTION_DAYS));
        entity.setStatus(STATUS_ACTIVE);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        workspaceMapper.insert(entity);
        return toWorkspaceSummary(entity);
    }

    @Override
    public WorkspaceSummary getWorkspace(Long id) {
        return toWorkspaceSummary(requireWorkspace(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkspaceSummary updateWorkspace(Long id, WorkspaceUpdateRequest request) {
        WorkspaceEntity entity = requireWorkspace(id);
        if (request == null) {
            return toWorkspaceSummary(entity);
        }
        if (hasText(request.getName())) {
            entity.setName(request.getName().trim());
        }
        setIfText(request.getSlug(), entity::setSlug);
        setIfText(request.getRegion(), entity::setRegion);
        setIfText(request.getEnvironment(), entity::setEnvironment);
        entity.setOwnerUserId(currentUserId());
        entity.setOwnerName(defaultString(request.getOwnerName(), currentUsername()));
        if (request.getMemberCount() != null) {
            entity.setMemberCount(nonNegative(request.getMemberCount()));
        }
        if (request.getDefaultTimeoutMin() != null) {
            entity.setDefaultTimeoutMin(defaultPositive(request.getDefaultTimeoutMin(), DEFAULT_TIMEOUT_MIN));
        }
        if (request.getRetentionDays() != null) {
            entity.setRetentionDays(defaultPositive(request.getRetentionDays(), DEFAULT_RETENTION_DAYS));
        }
        setIfText(request.getStatus(), entity::setStatus);
        entity.setUpdatedAt(LocalDateTime.now());
        workspaceMapper.updateById(entity);
        return toWorkspaceSummary(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteWorkspace(Long id) {
        WorkspaceEntity entity = requireWorkspace(id);
        entity.setStatus(STATUS_DELETED);
        entity.setUpdatedAt(LocalDateTime.now());
        workspaceMapper.updateById(entity);
        List<ProjectEntity> projects = projectMapper.selectList(new LambdaQueryWrapper<ProjectEntity>()
                .eq(ProjectEntity::getWorkspaceId, id)
                .eq(ProjectEntity::getOwnerUserId, currentUserId())
                .ne(ProjectEntity::getStatus, STATUS_DELETED));
        if (projects != null) {
            for (ProjectEntity project : projects) {
                project.setStatus(STATUS_DELETED);
                project.setUpdatedAt(LocalDateTime.now());
                projectMapper.updateById(project);
                retireProjectWorkflows(project.getId());
            }
        }
    }

    private LambdaQueryWrapper<ProjectEntity> projectQuery(Long userId, String query, Long workspaceId, String status) {
        LambdaQueryWrapper<ProjectEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProjectEntity::getOwnerUserId, userId);
        if (hasText(status)) {
            wrapper.eq(ProjectEntity::getStatus, status.trim());
        } else {
            wrapper.ne(ProjectEntity::getStatus, STATUS_DELETED);
        }
        if (workspaceId != null) {
            wrapper.eq(ProjectEntity::getWorkspaceId, workspaceId);
        }
        if (hasText(query)) {
            String text = query.trim();
            wrapper.and(child -> child.like(ProjectEntity::getName, text)
                    .or()
                    .like(ProjectEntity::getDescription, text)
                    .or()
                    .like(ProjectEntity::getScenario, text));
        }
        wrapper.orderByDesc(ProjectEntity::getUpdatedAt);
        return wrapper;
    }

    private LambdaQueryWrapper<WorkspaceEntity> workspaceQuery(Long userId, String query) {
        LambdaQueryWrapper<WorkspaceEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkspaceEntity::getOwnerUserId, userId);
        wrapper.ne(WorkspaceEntity::getStatus, STATUS_DELETED);
        if (hasText(query)) {
            String text = query.trim();
            wrapper.and(child -> child.like(WorkspaceEntity::getName, text)
                    .or()
                    .like(WorkspaceEntity::getSlug, text));
        }
        wrapper.orderByDesc(WorkspaceEntity::getUpdatedAt);
        return wrapper;
    }

    private ProjectEntity requireProject(Long id) {
        if (id == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "project id is required");
        }
        ProjectEntity entity = projectMapper.selectById(id);
        if (entity == null || STATUS_DELETED.equals(entity.getStatus()) || !owns(entity.getOwnerUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "project not found");
        }
        if (entity.getWorkspaceId() != null) {
            WorkspaceEntity workspace = workspaceMapper.selectById(entity.getWorkspaceId());
            if (workspace == null || STATUS_DELETED.equals(workspace.getStatus()) || !owns(workspace.getOwnerUserId())) {
                throw new BusinessException(ResultCode.NOT_FOUND, "project not found");
            }
        }
        return entity;
    }

    private void retireProjectWorkflows(Long projectId) {
        if (projectId == null || workflowDefinitionMapper == null) {
            return;
        }
        List<WorkflowDefinition> definitions = workflowDefinitionMapper.selectList(new LambdaQueryWrapper<WorkflowDefinition>()
                .eq(WorkflowDefinition::getProjectId, projectId)
                .eq(WorkflowDefinition::getOwnerUserId, currentUserId())
                .ne(WorkflowDefinition::getStatus, STATUS_DELETED));
        if (definitions == null || definitions.isEmpty()) {
            return;
        }
        List<Long> definitionIds = definitions.stream()
                .map(WorkflowDefinition::getId)
                .filter(java.util.Objects::nonNull)
                .toList();
        definitions.forEach(definition -> {
            definition.setStatus(STATUS_DELETED);
            definition.setUpdatedAt(LocalDateTime.now());
            workflowDefinitionMapper.updateById(definition);
        });
        if (workflowInstanceMapper == null || definitionIds.isEmpty()) {
            return;
        }
        List<WorkflowInstance> instances = workflowInstanceMapper.selectList(new LambdaQueryWrapper<WorkflowInstance>()
                .in(WorkflowInstance::getDefinitionId, definitionIds)
                .eq(WorkflowInstance::getUserId, currentUserId())
                .in(WorkflowInstance::getStatus, "PENDING", "RUNNING", "RETRYING", "WAITING"));
        if (instances != null) {
            instances.forEach(instance -> {
                instance.setStatus(com.aetherflow.workflow.runtime.api.RuntimeState.CANCELLED.name());
                instance.setCompletedAt(LocalDateTime.now());
                instance.setUpdatedAt(LocalDateTime.now());
                workflowInstanceMapper.updateById(instance);
            });
        }
    }

    private WorkspaceEntity requireWorkspace(Long id) {
        if (id == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workspace id is required");
        }
        WorkspaceEntity entity = workspaceMapper.selectById(id);
        if (entity == null || STATUS_DELETED.equals(entity.getStatus()) || !owns(entity.getOwnerUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "workspace not found");
        }
        return entity;
    }

    private ProjectSummary toProjectSummary(ProjectEntity entity) {
        ProjectTelemetry telemetry = telemetry(entity);
        return new ProjectSummary(
                String.valueOf(entity.getId()),
                entity.getWorkspaceId(),
                entity.getWorkspaceName(),
                entity.getName(),
                entity.getDescription(),
                defaultString(entity.getOwnerName(), DEFAULT_OWNER),
                defaultString(entity.getEnvironment(), DEFAULT_ENVIRONMENT),
                defaultString(entity.getHealth(), DEFAULT_HEALTH),
                defaultString(entity.getScenario(), DEFAULT_SCENARIO),
                defaultString(entity.getSlaTarget(), "< 8 min"),
                telemetry.queueDepth(),
                safeInt(entity.getKnowledgeCount()),
                telemetry.lastRunStatus(),
                telemetry.workflowCount(),
                telemetry.activeRunCount(),
                safeInt(entity.getFileCount()),
                formatTime(telemetry.updatedAt()),
                telemetry.workflows()
        );
    }

    private ProjectTelemetry telemetry(ProjectEntity project) {
        if (workflowDefinitionMapper == null || workflowInstanceMapper == null || project.getId() == null) {
            return new ProjectTelemetry(
                    safeInt(project.getWorkflowCount()),
                    safeInt(project.getActiveRunCount()),
                    safeInt(project.getQueueDepth()),
                    defaultString(project.getLastRunStatus(), DEFAULT_LAST_RUN_STATUS),
                    project.getUpdatedAt(),
                    List.of());
        }

        List<WorkflowDefinition> definitions = workflowDefinitionMapper.selectList(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getOwnerUserId, currentUserId())
                        .eq(WorkflowDefinition::getProjectId, project.getId())
                        .ne(WorkflowDefinition::getStatus, STATUS_DELETED)
                        .orderByDesc(WorkflowDefinition::getUpdatedAt)
                        .orderByDesc(WorkflowDefinition::getId));
        List<Long> definitionIds = definitions.stream()
                .map(WorkflowDefinition::getId)
                .filter(java.util.Objects::nonNull)
                .toList();
        List<WorkflowInstance> instances = definitionIds.isEmpty()
                ? List.of()
                : workflowInstanceMapper.selectList(new LambdaQueryWrapper<WorkflowInstance>()
                        .eq(WorkflowInstance::getUserId, currentUserId())
                        .in(WorkflowInstance::getDefinitionId, definitionIds));
        Set<String> activeStatuses = Set.of("PENDING", "RUNNING", "RETRYING", "WAITING");
        Set<String> queuedStatuses = Set.of("PENDING", "RETRYING");
        WorkflowInstance latest = instances.stream()
                .filter(instance -> instance.getUpdatedAt() != null)
                .max(Comparator.comparing(WorkflowInstance::getUpdatedAt)
                        .thenComparing(instance -> instance.getId() == null ? 0L : instance.getId()))
                .orElse(null);
        LocalDateTime latestTime = latest == null || latest.getUpdatedAt() == null
                ? project.getUpdatedAt()
                : latest.getUpdatedAt();
        return new ProjectTelemetry(
                definitions.size(),
                (int) instances.stream().filter(instance -> activeStatuses.contains(normalizeStatus(instance.getStatus()))).count(),
                (int) instances.stream().filter(instance -> queuedStatuses.contains(normalizeStatus(instance.getStatus()))).count(),
                latest == null ? defaultString(project.getLastRunStatus(), DEFAULT_LAST_RUN_STATUS)
                        : defaultString(normalizeStatus(latest.getStatus()), DEFAULT_LAST_RUN_STATUS).toLowerCase(Locale.ROOT),
                latestTime,
                definitions.stream().map(this::toWorkflowLink).toList());
    }

    private ProjectWorkflowLink toWorkflowLink(WorkflowDefinition definition) {
        return new ProjectWorkflowLink(
                String.valueOf(definition.getId()),
                defaultString(definition.getName(), "Workflow " + definition.getId()),
                defaultString(definition.getStatus(), STATUS_ACTIVE).toLowerCase(Locale.ROOT),
                formatTime(definition.getUpdatedAt()));
    }

    private String normalizeStatus(String status) {
        return status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
    }

    private record ProjectTelemetry(
            Integer workflowCount,
            Integer activeRunCount,
            Integer queueDepth,
            String lastRunStatus,
            LocalDateTime updatedAt,
            List<ProjectWorkflowLink> workflows
    ) {
    }

    private WorkspaceSummary toWorkspaceSummary(WorkspaceEntity entity) {
        return new WorkspaceSummary(
                String.valueOf(entity.getId()),
                entity.getName(),
                entity.getSlug(),
                defaultString(entity.getRegion(), DEFAULT_REGION),
                defaultString(entity.getEnvironment(), DEFAULT_ENVIRONMENT),
                defaultString(entity.getOwnerName(), DEFAULT_OWNER),
                defaultPositive(entity.getMemberCount(), 1),
                defaultPositive(entity.getDefaultTimeoutMin(), DEFAULT_TIMEOUT_MIN),
                defaultPositive(entity.getRetentionDays(), DEFAULT_RETENTION_DAYS),
                formatTime(entity.getUpdatedAt())
        );
    }

    private static int pageNo(int page) {
        return Math.max(page, 1);
    }

    private static int pageSize(int size) {
        if (size <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }

    private static void requireName(String value, String message) {
        if (!hasText(value)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, message);
        }
    }

    private static String defaultString(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }

    private static String defaultString(String preferred, String fallback, String finalFallback) {
        return hasText(preferred) ? preferred.trim() : defaultString(fallback, finalFallback);
    }

    private static String trimToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private static void setIfText(String value, java.util.function.Consumer<String> consumer) {
        if (hasText(value)) {
            consumer.accept(value.trim());
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static int defaultInt(Integer value) {
        return value == null ? 0 : nonNegative(value);
    }

    private static int defaultPositive(Integer value, int fallback) {
        return value == null || value <= 0 ? fallback : value;
    }

    private static int nonNegative(Integer value) {
        return Math.max(value == null ? 0 : value, 0);
    }

    private static int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private static String formatTime(LocalDateTime time) {
        return time == null ? null : time.toString();
    }

    private static String slugify(String value) {
        String slug = value == null ? "" : value.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return slug.isBlank() ? "workspace" : slug;
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
