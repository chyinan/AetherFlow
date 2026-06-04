package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.project.entity.ProjectEntity;
import com.aetherflow.workflow.project.mapper.ProjectMapper;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.dag.WorkflowDag;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.aetherflow.workflow.service.WorkflowService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.seata.spring.annotation.GlobalTransactional;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkflowServiceImpl implements WorkflowService {

    private static final String STATUS_ENABLED = "ENABLED";
    private static final String STATUS_DELETED = "DELETED";
    private static final String DEFAULT_OWNER = "aether.operator";

    private final WorkflowDefinitionMapper definitionMapper;
    private final WorkflowInstanceMapper instanceMapper;
    private final ProjectMapper projectMapper;
    private final WorkflowRuntimeEngine runtimeEngine;
    private final ObjectMapper objectMapper;
    private final WorkflowRuntimeProperties runtimeProperties;
    private final NodeRegistry nodeRegistry;
    @Qualifier("workflowRuntimeTaskExecutor")
    private final TaskExecutor workflowRuntimeTaskExecutor;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowDefinition createDefinition(WorkflowDefinitionDTO request) {
        validateDag(request);
        Long userId = currentUserId();
        WorkflowDefinition definition = new WorkflowDefinition();
        definition.setName(request.getName());
        definition.setDescription(request.getDescription());
        definition.setProjectId(requireOwnedProjectId(request.getProjectId()));
        definition.setOwnerUserId(userId);
        definition.setOwnerName(currentUsername());
        definition.setDefinitionJson(writeJson(request));
        definition.setVersion(1);
        definition.setStatus(STATUS_ENABLED);
        definition.setCreatedAt(LocalDateTime.now());
        definition.setUpdatedAt(LocalDateTime.now());
        definitionMapper.insert(definition);
        return definition;
    }

    @Override
    public List<WorkflowDefinition> listDefinitions() {
        return definitionMapper.selectList(new LambdaQueryWrapper<WorkflowDefinition>()
                .eq(WorkflowDefinition::getOwnerUserId, currentUserId())
                .ne(WorkflowDefinition::getStatus, STATUS_DELETED)
                .orderByDesc(WorkflowDefinition::getUpdatedAt)
                .orderByDesc(WorkflowDefinition::getId));
    }

    @Override
    public WorkflowDefinition getDefinition(Long definitionId) {
        return getExistingDefinition(definitionId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowDefinition updateDefinition(Long definitionId, WorkflowDefinitionDTO request) {
        WorkflowDefinition definition = getExistingDefinition(definitionId);
        validateDag(request);
        definition.setName(request.getName());
        definition.setDescription(request.getDescription());
        if (request.getProjectId() != null) {
            definition.setProjectId(requireOwnedProjectId(request.getProjectId()));
        }
        definition.setDefinitionJson(writeJson(request));
        definition.setVersion(nextVersion(definition.getVersion()));
        definition.setUpdatedAt(LocalDateTime.now());
        definitionMapper.updateById(definition);
        return definition;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDefinition(Long definitionId) {
        WorkflowDefinition definition = getExistingDefinition(definitionId);
        definition.setStatus(STATUS_DELETED);
        definition.setUpdatedAt(LocalDateTime.now());
        definitionMapper.updateById(definition);
    }

    @Override
    @GlobalTransactional(name = "aetherflow-start-workflow-instance", rollbackFor = Exception.class)
    public WorkflowInstance startInstance(Long definitionId, StartWorkflowRequest request) {
        Long userId = currentUserId();
        WorkflowDefinition definition = getExistingDefinition(definitionId);

        WorkflowDefinitionDTO definitionDTO = readDefinition(definition.getDefinitionJson());
        validateDag(definitionDTO);
        Map<String, Object> input = request == null || request.getInput() == null ? Map.of() : request.getInput();

        WorkflowInstance instance = new WorkflowInstance();
        instance.setDefinitionId(definitionId);
        instance.setUserId(userId);
        instance.setInputJson(writeJson(input));
        instance.setStatus(RuntimeState.RUNNING.name());
        instance.setStartedAt(LocalDateTime.now());
        instance.setUpdatedAt(LocalDateTime.now());
        instanceMapper.insert(instance);

        WorkflowRuntimeRequest runtimeRequest = new WorkflowRuntimeRequest(
                String.valueOf(instance.getId()),
                newTraceId(),
                String.valueOf(instance.getId()),
                definitionDTO,
                runtimeVariables(definitionDTO, input, userId),
                runtimeProperties.getRetry().toRetryPolicy()
        );

        workflowRuntimeTaskExecutor.execute(() -> executeRuntime(instance.getId(), runtimeRequest));
        return instance;
    }

    private void executeRuntime(Long instanceId, WorkflowRuntimeRequest runtimeRequest) {
        WorkflowInstance update = new WorkflowInstance();
        update.setId(instanceId);
        try {
            WorkflowExecutionSnapshot snapshot = runtimeEngine.execute(runtimeRequest);
            applySnapshot(update, snapshot);
            update.setCompletedAt(LocalDateTime.now());
            update.setUpdatedAt(LocalDateTime.now());
            instanceMapper.updateById(update);
        } catch (RuntimeException exception) {
            update.setStatus(RuntimeState.FAILED.name());
            update.setCompletedAt(LocalDateTime.now());
            update.setUpdatedAt(LocalDateTime.now());
            instanceMapper.updateById(update);
            log.warn("workflow runtime execution failed, workflowId={}, reason={}",
                    runtimeRequest.workflowId(), exception.getMessage(), exception);
        }
    }

    private WorkflowDefinition getExistingDefinition(Long definitionId) {
        if (definitionId == null || definitionId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflow definition id is invalid");
        }
        WorkflowDefinition definition = definitionMapper.selectById(definitionId);
        if (definition == null || STATUS_DELETED.equals(definition.getStatus()) || !owns(definition.getOwnerUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "workflow definition not found");
        }
        return definition;
    }

    private Long requireOwnedProjectId(Long projectId) {
        if (projectId == null) {
            return null;
        }
        if (projectId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "project id is invalid");
        }
        ProjectEntity project = projectMapper.selectById(projectId);
        if (project == null || STATUS_DELETED.equals(project.getStatus()) || !owns(project.getOwnerUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "project not found");
        }
        return projectId;
    }

    private int nextVersion(Integer currentVersion) {
        return (currentVersion == null ? 0 : currentVersion) + 1;
    }

    private void applySnapshot(WorkflowInstance instance, WorkflowExecutionSnapshot snapshot) {
        instance.setStatus(snapshot.runtimeState().name());
        instance.setCurrentNodeId(snapshot.currentNodeId());
    }

    private Map<String, Object> runtimeVariables(WorkflowDefinitionDTO definition, Map<String, Object> input, Long userId) {
        Map<String, Object> variables = new LinkedHashMap<>(input == null ? Map.of() : input);
        if (userId != null && !variables.containsKey("userId")) {
            variables.put("userId", userId);
        }
        variables.put(WorkflowNodeContextKeys.NODE_CONFIGS, nodeConfigs(definition));
        return variables;
    }

    private Map<String, Map<String, Object>> nodeConfigs(WorkflowDefinitionDTO definition) {
        Map<String, Map<String, Object>> configs = new LinkedHashMap<>();
        if (definition.getNodes() == null) {
            return configs;
        }
        for (WorkflowNodeDTO node : definition.getNodes()) {
            if (node.getNodeId() != null && !node.getNodeId().isBlank()) {
                configs.put(node.getNodeId(), node.getConfig() == null ? Map.of() : Map.copyOf(node.getConfig()));
            }
        }
        return configs;
    }

    private BusinessException runtimeFailure(RuntimeException exception) {
        if (exception instanceof BusinessException businessException) {
            return businessException;
        }
        if (exception instanceof IllegalArgumentException) {
            return new BusinessException(ResultCode.BAD_REQUEST,
                    "workflow runtime execution failed: " + exception.getMessage());
        }
        return new BusinessException(ResultCode.INTERNAL_ERROR,
                "workflow runtime execution failed: " + exception.getMessage());
    }

    private void validateDag(WorkflowDefinitionDTO definition) {
        try {
            WorkflowDag.from(definition);
            validateNodeTypes(definition);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflow dag invalid: " + exception.getMessage());
        }
    }

    private void validateNodeTypes(WorkflowDefinitionDTO definition) {
        if (definition.getNodes() == null) {
            return;
        }
        for (WorkflowNodeDTO node : definition.getNodes()) {
            NodeType nodeType = NodeType.of(node.getNodeType());
            if (nodeRegistry.get(nodeType).isEmpty()) {
                throw new IllegalArgumentException("unsupported workflow node type: " + nodeType.value());
            }
        }
    }

    private String newTraceId() {
        return UUID.randomUUID().toString().replace("-", "");
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

    private WorkflowDefinitionDTO readDefinition(String definitionJson) {
        try {
            return objectMapper.readValue(definitionJson, WorkflowDefinitionDTO.class);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "workflow definition json invalid");
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "json serialization failed");
        }
    }
}

