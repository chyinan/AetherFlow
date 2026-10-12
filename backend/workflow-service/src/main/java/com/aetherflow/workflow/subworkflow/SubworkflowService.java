package com.aetherflow.workflow.subworkflow;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.entity.WorkflowStartOutbox;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowStartOutboxMapper;
import com.aetherflow.workflow.node.mapping.StructuredDataMapper;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.aetherflow.workflow.service.impl.WorkflowServiceImpl;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SubworkflowService {
    private final WorkflowVersionService versions;
    private final WorkflowChildRunMapper childRunMapper;
    private final WorkflowInstanceMapper instanceMapper;
    private final WorkflowStartOutboxMapper startOutboxMapper;
    private final ObjectMapper objectMapper;
    private final RuntimeSnapshotRepository snapshots;
    private final ObjectProvider<WorkflowServiceImpl> workflowService;

    /** 实例、调用关系和启动 Outbox 同事务落库；失败重试不会创建第二个子实例。 */
    @Transactional(rollbackFor = Exception.class)
    public NodeResult invoke(WorkflowContext context, Map<String, Object> nodeConfig) {
        SubworkflowConfig config = SubworkflowConfig.from(nodeConfig);
        long parentId = Long.parseLong(context.workflowId());
        Long userId = AuthenticatedUserContext.requireUserId();
        WorkflowInstance parent = instanceMapper.selectById(parentId);
        if (parent == null || !userId.equals(parent.getUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "parent workflow instance not found");
        }
        if (terminal(parent.getStatus())) throw new IllegalStateException("parent workflow is already terminal");
        String key = invocationKey(context.currentNodeId());
        WorkflowChildRun existing = childRunMapper.findInvocation(parentId, key);
        if (existing != null) return NodeResult.waiting(receipt(existing));

        WorkflowDefinitionVersion version = versions.require(config.definitionId(), config.definitionVersion());
        WorkflowDefinitionDTO definition = versions.read(version);
        workflowService.getObject().validateExecutableSnapshot(definition);
        Map<String, Object> input = mapValues(config.inputMappings(), context.variables());
        WorkflowInstance child = new WorkflowInstance();
        child.setDefinitionId(config.definitionId());
        child.setUserId(userId);
        child.setIdempotencyKey("subworkflow:" + parentId + ":" + key);
        child.setStatus(RuntimeState.PENDING.name());
        child.setInputJson(writeJson(input));
        child.setDefinitionJson(version.getDefinitionJson());
        LocalDateTime now = LocalDateTime.now();
        child.setStartedAt(now);
        child.setUpdatedAt(now);
        if (instanceMapper.insertIdempotent(child) != 1) {
            // 重复启动键仅由同一调用生成；原事务包含了完整关系和 Outbox。
            WorkflowChildRun duplicate = childRunMapper.findInvocation(parentId, key);
            if (duplicate != null) return NodeResult.waiting(receipt(duplicate));
            throw new IllegalStateException("subworkflow invocation is not yet visible; retry required");
        }
        WorkflowStartOutbox outbox = new WorkflowStartOutbox();
        outbox.setWorkflowInstanceId(child.getId());
        outbox.setStatus(WorkflowStartOutbox.PENDING);
        outbox.setAttemptCount(0);
        outbox.setNextAttemptAt(now);
        outbox.setCreatedAt(now);
        outbox.setUpdatedAt(now);
        startOutboxMapper.insert(outbox);
        WorkflowChildRun run = new WorkflowChildRun();
        run.setParentInstanceId(parentId);
        run.setParentNodeId(context.currentNodeId());
        run.setInvocationKey(key);
        run.setChildInstanceId(child.getId());
        run.setDefinitionId(config.definitionId());
        run.setDefinitionVersion(config.definitionVersion());
        run.setOwnerUserId(userId);
        run.setOutputMappingsJson(writeJson(config.outputMappings()));
        run.setStatus("WAITING");
        run.setNextAttemptAt(now);
        run.setCreatedAt(now);
        run.setUpdatedAt(now);
        childRunMapper.insert(run);
        return NodeResult.waiting(receipt(run));
    }

    public record ChildRunView(String parentNodeId, Long childInstanceId, Long definitionId,
                               Integer definitionVersion, String status, LocalDateTime createdAt,
                               boolean reused, Long sourceParentInstanceId) { }

    public List<ChildRunView> list(Long parentId) {
        Long userId = AuthenticatedUserContext.requireUserId();
        WorkflowInstance parent = instanceMapper.selectById(parentId);
        if (parent == null || !userId.equals(parent.getUserId())) return List.of();
        Map<String, ChildRunView> views = new LinkedHashMap<>();
        for (WorkflowChildRun run : childRunMapper.listOwned(parentId, userId)) {
            views.put(run.getParentNodeId(), view(run, run.getParentNodeId(), false));
        }
        // 派生重跑复用成功输出；只展示原调用关系，不复制执行或取消权威记录。
        WorkflowRuntimeSnapshot snapshot = snapshots.findByWorkflowId(String.valueOf(parentId)).orElse(null);
        if (snapshot != null) {
            snapshot.nodeOutputs().forEach((nodeId, output) -> {
                if (views.containsKey(nodeId) || output.waiting()
                        || !"SUBWORKFLOW".equalsIgnoreCase(com.aetherflow.workflow.runtime.engine.NestedNodeSupport.nodeType(snapshot, nodeId))) return;
                if (output.output().get("childWorkflowInstanceId") instanceof Number id) {
                    WorkflowChildRun source = childRunMapper.findChildOwned(id.longValue(), userId);
                    if (source != null) views.put(nodeId, view(source, nodeId, !parentId.equals(source.getParentInstanceId())));
                }
            });
        }
        return List.copyOf(views.values());
    }

    private ChildRunView view(WorkflowChildRun run, String nodeId, boolean reused) {
        return new ChildRunView(nodeId, run.getChildInstanceId(), run.getDefinitionId(), run.getDefinitionVersion(),
                run.getStatus(), run.getCreatedAt(), reused, run.getParentInstanceId());
    }

    public NodeResult result(WorkflowChildRun run) {
        WorkflowRuntimeSnapshot snapshot = snapshots.findByWorkflowId(String.valueOf(run.getChildInstanceId())).orElse(null);
        WorkflowInstance child = instanceMapper.selectById(run.getChildInstanceId());
        // 取消实例优先于仍未刷新的成功快照。
        if (child != null && ("FAILED".equals(child.getStatus()) || "CANCELLED".equals(child.getStatus()))) {
            throw new SubworkflowResultException("subworkflow " + child.getId() + " ended with " + child.getStatus());
        }
        if (snapshot == null || !terminal(snapshot.runtimeState().name())) return NodeResult.waiting(receipt(run));
        if (snapshot.runtimeState() != RuntimeState.SUCCESS) {
            throw new SubworkflowResultException("subworkflow " + run.getChildInstanceId() + " ended with " + snapshot.runtimeState());
        }
        Map<String, String> mappings;
        try {
            mappings = objectMapper.readValue(run.getOutputMappingsJson(),
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() { });
        } catch (JsonProcessingException exception) {
            throw new SubworkflowResultException("subworkflow output mappings are invalid", exception);
        }
        Map<String, Object> variables;
        try { variables = mapValues(mappings, snapshot.variables()); }
        catch (IllegalArgumentException exception) {
            throw new SubworkflowResultException("subworkflow output mapping failed: " + exception.getMessage(), exception);
        }
        Map<String, Object> output = new LinkedHashMap<>(receipt(run));
        output.put("outputs", variables);
        return NodeResult.success(output, variables);
    }

    public static Map<String, Object> mapValues(Map<String, String> mappings, Map<String, Object> source) {
        Map<String, Object> result = new LinkedHashMap<>();
        mappings.forEach((name, path) -> {
            Object value = StructuredDataMapper.readPath(source, path);
            if (value == null) throw new IllegalArgumentException("subworkflow mapping cannot publish null: " + name);
            result.put(name, value);
        });
        return result;
    }

    private Map<String, Object> receipt(WorkflowChildRun run) {
        return Map.of("childWorkflowInstanceId", run.getChildInstanceId(), "definitionId", run.getDefinitionId(),
                "definitionVersion", run.getDefinitionVersion());
    }

    static boolean terminal(String status) {
        return List.of("SUCCESS", "FAILED", "CANCELLED").contains(status == null ? "" : status);
    }

    private String invocationKey(String nodeId) {
        if (nodeId == null || nodeId.isBlank() || nodeId.length() > 1000) {
            throw new IllegalArgumentException("subworkflow invocation node id is invalid");
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(nodeId.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String writeJson(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalArgumentException("subworkflow JSON is invalid", exception); }
    }
}
