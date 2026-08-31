package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.controller.WorkflowCopyRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowStartOutboxMapper;
import com.aetherflow.workflow.entity.WorkflowStartOutbox;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.node.validation.WorkflowNodeConfigValidator;
import com.aetherflow.workflow.embedding.config.EmbeddingProperties;
import com.aetherflow.workflow.project.entity.ProjectEntity;
import com.aetherflow.workflow.project.mapper.ProjectMapper;
import com.aetherflow.workflow.preflight.WorkflowAiCapabilityPreflightService;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.dag.WorkflowDag;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.notification.WorkflowTerminalNotificationOutboxService;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.aetherflow.workflow.service.WorkflowService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.seata.spring.annotation.GlobalTransactional;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
// pattern: Imperative Shell
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
    private final WorkflowNodeCatalogService workflowNodeCatalogService;
    private final WorkflowAiCapabilityPreflightService aiCapabilityPreflightService;
    @Qualifier("workflowRuntimeTaskExecutor")
    private final TaskExecutor workflowRuntimeTaskExecutor;
    private final WorkflowStartOutboxMapper workflowStartOutboxMapper;

    @Autowired(required = false)
    private RuntimeSnapshotRepository runtimeSnapshotRepository;

    @Autowired(required = false)
    private WorkflowNodeProperties workflowNodeProperties;

    @Autowired(required = false)
    private WorkflowTerminalNotificationOutboxService terminalNotificationOutboxService;

    @Autowired(required = false)
    private EmbeddingProperties embeddingProperties;

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
    @Transactional(rollbackFor = Exception.class)
    @GlobalTransactional(name = "aetherflow-start-workflow-instance", rollbackFor = Exception.class)
    public WorkflowInstance startInstance(Long definitionId, StartWorkflowRequest request) {
        Long userId = currentUserId();
        WorkflowDefinition definition = getExistingDefinition(definitionId);

        WorkflowDefinitionDTO definitionDTO = readDefinition(definition.getDefinitionJson());
        validateDag(definitionDTO);
        validateRuntimePreflight(definitionDTO);
        Map<String, Object> input = request == null || request.getInput() == null ? Map.of() : request.getInput();

        WorkflowInstance instance = new WorkflowInstance();
        instance.setDefinitionId(definitionId);
        instance.setUserId(userId);
        instance.setInputJson(writeJson(input));
        // The instance is not running until the durable start outbox has been
        // claimed. This prevents an in-flight HTTP transaction from racing the
        // recovery scanner and makes the outbox the single dispatch authority.
        instance.setStatus(RuntimeState.PENDING.name());
        instance.setStartedAt(LocalDateTime.now());
        instance.setUpdatedAt(LocalDateTime.now());
        instanceMapper.insert(instance);

        createStartOutbox(instance);
        dispatchStartsAfterCommit();
        return instance;
    }

    private void executeRuntime(Long instanceId, WorkflowRuntimeRequest runtimeRequest) {
        try {
            workflowStartOutboxMapper.markDispatched(instanceId, LocalDateTime.now());
            WorkflowExecutionSnapshot snapshot = runtimeEngine.execute(runtimeRequest);
            persistRuntimeProjection(instanceId, snapshot);
        } catch (RuntimeException exception) {
            LocalDateTime failedAt = LocalDateTime.now();
            int transitioned = instanceMapper.transitionRuntimeState(
                    instanceId,
                    RuntimeState.FAILED.name(),
                    null,
                    failedAt,
                    failedAt);
            if (transitioned == 1 && terminalNotificationOutboxService != null) {
                enqueueTerminalNotification(instanceId, userId(runtimeRequest.variables()), runtimeRequest.traceId(),
                        RuntimeState.FAILED, null);
            }
            log.warn("workflow runtime execution failed, workflowId={}, reason={}",
                    runtimeRequest.workflowId(), exception.getMessage(), exception);
        }
    }

    public int dispatchPendingStarts() {
        LocalDateTime now = LocalDateTime.now();
        int dispatched = 0;
        for (WorkflowStartOutbox outbox : workflowStartOutboxMapper.selectDue(now, now.minusMinutes(30), 50)) {
            if (workflowStartOutboxMapper.claim(outbox.getId(), now, now.minusMinutes(30)) != 1) {
                continue;
            }
            try {
                WorkflowInstance instance = instanceMapper.selectById(outbox.getWorkflowInstanceId());
                if (instance == null || isTerminalStatus(instance.getStatus())) {
                    workflowStartOutboxMapper.markDispatched(outbox.getWorkflowInstanceId(), LocalDateTime.now());
                    continue;
                }
                if ("DISPATCHED".equals(outbox.getStatus()) && runtimeSnapshotRepository != null
                        && runtimeSnapshotRepository.findByWorkflowId(String.valueOf(instance.getId())).isPresent()) {
                    workflowStartOutboxMapper.markDispatched(instance.getId(), LocalDateTime.now());
                    continue;
                }
                WorkflowDefinition definition = getExistingDefinitionForRecovery(instance.getDefinitionId());
                WorkflowDefinitionDTO definitionDTO = readDefinition(definition.getDefinitionJson());
                Map<String, Object> input = readInput(instance.getInputJson());
                WorkflowRuntimeRequest runtimeRequest = new WorkflowRuntimeRequest(
                        String.valueOf(instance.getId()), newTraceId(), String.valueOf(instance.getId()),
                        definition.getId(), definitionDTO,
                        runtimeVariables(definitionDTO, input, instance.getUserId()),
                        runtimeProperties.getRetry().toRetryPolicy());
                workflowRuntimeTaskExecutor.execute(() -> AuthenticatedUserContext.runAs(
                        instance.getUserId(), definition.getOwnerName(), () -> {
                            executeRuntime(instance.getId(), runtimeRequest);
                            return null;
                        }));
                dispatched++;
            } catch (RuntimeException exception) {
                workflowStartOutboxMapper.markRetry(outbox.getId(), now.plusSeconds(5),
                        exception.getMessage(), LocalDateTime.now());
            }
        }
        return dispatched;
    }

    private void createStartOutbox(WorkflowInstance instance) {
        WorkflowStartOutbox outbox = new WorkflowStartOutbox();
        outbox.setWorkflowInstanceId(instance.getId());
        outbox.setStatus(WorkflowStartOutbox.PENDING);
        outbox.setAttemptCount(0);
        outbox.setNextAttemptAt(LocalDateTime.now());
        outbox.setCreatedAt(LocalDateTime.now());
        outbox.setUpdatedAt(LocalDateTime.now());
        workflowStartOutboxMapper.insert(outbox);
    }

    private void dispatchStartsAfterCommit() {
        Runnable dispatcher = () -> {
            try {
                dispatchPendingStarts();
            } catch (RuntimeException exception) {
                // The durable PENDING row remains available to the scheduled
                // recovery job when the after-commit dispatch attempt cannot
                // reach the database or executor.
                log.warn("workflow start after-commit dispatch failed; recovery job will retry", exception);
            }
        };
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            dispatcher.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                dispatcher.run();
            }
        });
    }

    private boolean isTerminalStatus(String status) {
        return RuntimeState.SUCCESS.name().equals(status)
                || RuntimeState.FAILED.name().equals(status)
                || RuntimeState.CANCELLED.name().equals(status);
    }

    private WorkflowDefinition getExistingDefinitionForRecovery(Long definitionId) {
        WorkflowDefinition definition = definitionMapper.selectById(definitionId);
        if (definition == null || STATUS_DELETED.equals(definition.getStatus())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "workflow definition not found");
        }
        return definition;
    }

    private Map<String, Object> readInput(String inputJson) {
        if (inputJson == null || inputJson.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(inputJson, new TypeReference<Map<String, Object>>() { });
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "workflow input json invalid");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowDefinition copyDefinition(Long definitionId, WorkflowCopyRequest request) {
        WorkflowDefinition source = getExistingDefinition(definitionId);
        WorkflowDefinitionDTO copy = readDefinition(source.getDefinitionJson());
        String requestedName = request == null ? null : request.getName();
        copy.setName(requestedName == null || requestedName.isBlank()
                ? source.getName() + " Copy" : requestedName.trim());
        copy.setProjectId(source.getProjectId());
        return createDefinition(copy);
    }

    @Override
    public List<WorkflowDefinitionDTO> listTemplates() {
        return List.of(mediaDigestTemplate(), textSummaryTemplate());
    }

    private WorkflowDefinitionDTO mediaDigestTemplate() {
        return template("Media digest", "Upload media, transcribe and summarize the content.", List.of(
                templateNode("start", "START", "Start", Map.of("nextNodes", List.of("upload"))),
                templateNode("upload", "UPLOAD", "Input media", Map.of("nextNodes", List.of("whisper"), "fileIdVariable", "fileId")),
                templateNode("whisper", "WHISPER", "Transcribe media", Map.of("nextNodes", List.of("summary"), "fileUrlVariable", "fileUrl", "language", "auto")),
                templateNode("summary", "SUMMARY", "Summarize transcript", Map.of("nextNodes", List.of("end"), "textVariable", "text")),
                templateNode("end", "END", "Complete", Map.of())
        ));
    }

    private WorkflowDefinitionDTO textSummaryTemplate() {
        return template("Text summary", "Generate a concise summary from a prompt.", List.of(
                templateNode("start", "START", "Start", Map.of("nextNodes", List.of("llm"))),
                templateNode("llm", "LLM", "Generate summary", Map.of("nextNodes", List.of("end"), "prompt", "{{ prompt }}")),
                templateNode("end", "END", "Complete", Map.of())
        ));
    }

    private WorkflowDefinitionDTO template(String name, String description, List<WorkflowNodeDTO> nodes) {
        WorkflowDefinitionDTO template = new WorkflowDefinitionDTO();
        template.setName(name);
        template.setDescription(description);
        template.setNodes(nodes);
        return template;
    }

    private WorkflowNodeDTO templateNode(String id, String type, String label, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setDisplayName(label);
        node.setConfig(config);
        return node;
    }

    private void persistRuntimeProjection(Long instanceId, WorkflowExecutionSnapshot snapshot) {
        LocalDateTime updatedAt = LocalDateTime.now();
        int transitioned = instanceMapper.transitionRuntimeState(
                instanceId,
                snapshot.runtimeState().name(),
                snapshot.currentNodeId(),
                isTerminal(snapshot.runtimeState()) ? updatedAt : null,
                updatedAt);
        if (transitioned == 1 && isTerminal(snapshot.runtimeState()) && terminalNotificationOutboxService != null) {
            enqueueTerminalNotification(instanceId, userId(snapshot.variables()), snapshot.traceId(),
                    snapshot.runtimeState(), snapshot.currentNodeId());
        }
    }

    private void enqueueTerminalNotification(Long instanceId,
                                             Long userId,
                                             String traceId,
                                             RuntimeState state,
                                             String currentNodeId) {
        try {
            terminalNotificationOutboxService.enqueue(instanceId, userId, traceId, state, currentNodeId);
        } catch (RuntimeException exception) {
            // Notification persistence must not downgrade an already committed
            // workflow result. The failure remains visible in logs/metrics;
            // operators can replay the terminal event from the runtime record.
            log.error("workflow terminal notification enqueue failed, instanceId={}, state={}",
                    instanceId, state, exception);
        }
    }

    private boolean isTerminal(RuntimeState state) {
        return state == RuntimeState.SUCCESS
                || state == RuntimeState.FAILED
                || state == RuntimeState.CANCELLED;
    }

    private Long userId(Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("userId");
        if (value instanceof Number number && number.longValue() > 0) {
            return number.longValue();
        }
        if (value != null) {
            try {
                long parsed = Long.parseLong(String.valueOf(value));
                return parsed > 0 ? parsed : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private WorkflowDefinition getExistingDefinition(Long definitionId) {
        if (definitionId == null || definitionId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflow definition id is invalid");
        }
        WorkflowDefinition definition = definitionMapper.selectById(definitionId);
        if (definition == null || STATUS_DELETED.equals(definition.getStatus()) || !owns(definition.getOwnerUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "workflow definition not found");
        }
        if (definition.getProjectId() != null) {
            ProjectEntity project = projectMapper.selectById(definition.getProjectId());
            if (project == null || STATUS_DELETED.equals(project.getStatus()) || !owns(project.getOwnerUserId())) {
                throw new BusinessException(ResultCode.NOT_FOUND, "workflow project not found");
            }
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

    private Map<String, Object> runtimeVariables(WorkflowDefinitionDTO definition, Map<String, Object> input, Long userId) {
        Map<String, Object> variables = new LinkedHashMap<>(input == null ? Map.of() : input);
        if (userId != null) {
            variables.put("userId", userId);
        }
        String username = currentUsername();
        if (username != null && !username.isBlank()) {
            variables.put("username", username);
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
            WorkflowDag dag = WorkflowDag.from(definition);
            validateNodeTypes(definition);
            validateExplicitStartRoots(definition, dag);
            List<String> configViolations = WorkflowNodeConfigValidator.validateAll(
                    definition.getNodes(), workflowNodeCatalogService);
            if (!configViolations.isEmpty()) {
                throw new IllegalArgumentException(String.join("; ", configViolations));
            }
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

    private void validateExplicitStartRoots(WorkflowDefinitionDTO definition, WorkflowDag dag) {
        boolean hasExplicitStart = definition.getNodes().stream()
                .anyMatch(node -> "START".equalsIgnoreCase(node.getNodeType()));
        if (!hasExplicitStart) {
            return;
        }
        Map<String, String> types = new LinkedHashMap<>();
        definition.getNodes().forEach(node -> types.put(node.getNodeId(), node.getNodeType()));
        boolean disconnectedRoot = dag.startNodeIds().stream()
                .anyMatch(root -> !"START".equalsIgnoreCase(types.get(root)));
        if (disconnectedRoot) {
            throw new IllegalArgumentException(
                    "workflow dag contains a disconnected root; connect every root to a START node");
        }
    }

    private void validateRuntimePreflight(WorkflowDefinitionDTO definition) {
        if (definition == null || definition.getNodes() == null) {
            return;
        }
        for (WorkflowNodeDTO node : definition.getNodes()) {
            String nodeType = node.getNodeType() == null ? "" : node.getNodeType().trim();
            Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
            if ("CODE".equalsIgnoreCase(nodeType) && workflowNodeProperties != null) {
                if (!workflowNodeProperties.isCodeExecutionEnabled()) {
                    throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                            "workflow contains a code node but isolated code execution is disabled");
                }
                if (!workflowNodeProperties.isCodeRuntimeIsolationConfirmed()) {
                    throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                            "workflow contains a code node but runtime isolation is not confirmed");
                }
                String runtimeUrl = workflowNodeProperties.getCodeRuntimeUrl() == null
                        ? ""
                        : workflowNodeProperties.getCodeRuntimeUrl().trim();
                if (runtimeUrl.isBlank()) {
                    throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                            "workflow contains a code node but isolated code runtime URL is missing");
                }
                try {
                    URI uri = URI.create(runtimeUrl);
                    if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                            || uri.getHost() == null) {
                        throw new IllegalArgumentException("runtime URL must be an HTTP(S) URL with a host");
                    }
                } catch (IllegalArgumentException exception) {
                    throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                            "workflow contains a code node but isolated code runtime URL is invalid");
                }
                if (workflowNodeProperties.getCodeRuntimeApiKey() == null
                        || workflowNodeProperties.getCodeRuntimeApiKey().trim().length() < 32) {
                    throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                            "workflow contains a code node but isolated code runtime credential is missing");
                }
            }
            if ("KNOWLEDGE_RETRIEVAL".equalsIgnoreCase(nodeType)) {
                Object datasetId = config.getOrDefault("datasetId",
                        config.getOrDefault("dataset", config.get("vectorCollection")));
                if (datasetId == null || String.valueOf(datasetId).isBlank()) {
                    throw new BusinessException(ResultCode.BAD_REQUEST,
                            "knowledge retrieval node datasetId is required");
                }
                try {
                    if (Long.parseLong(String.valueOf(datasetId).trim()) <= 0) {
                        throw new NumberFormatException("dataset id must be positive");
                    }
                } catch (NumberFormatException exception) {
                    throw new BusinessException(ResultCode.BAD_REQUEST,
                            "knowledge retrieval node datasetId is invalid");
                }
            }
            if ("EMBEDDING".equalsIgnoreCase(nodeType)
                    && embeddingProperties != null
                    && "memory".equalsIgnoreCase(String.valueOf(config.getOrDefault(
                    "vectorStoreProvider", embeddingProperties.getDefaultVectorStoreProvider())))
                    && !embeddingProperties.isInMemoryEnabled()) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "embedding node uses process-memory vector storage, which is disabled in this environment");
            }
        }
        aiCapabilityPreflightService.validate(definition);
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

