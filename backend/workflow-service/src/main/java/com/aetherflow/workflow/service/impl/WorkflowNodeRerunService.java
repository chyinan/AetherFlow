package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.entity.WorkflowStartOutbox;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowStartOutboxMapper;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.runtime.rerun.FailedNodeRerunPlan;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
// pattern: Imperative Shell
public class WorkflowNodeRerunService {
    private final WorkflowInstanceMapper instanceMapper;
    private final WorkflowStartOutboxMapper outboxMapper;
    private final RuntimeSnapshotRepository snapshots;
    private final WorkflowServiceImpl workflowService;
    private final ObjectMapper objectMapper;

    public record NodeRef(String nodeId, String label) { }
    public record Preview(Long sourceInstanceId, String nodeId, String revision, boolean eligible,
                          List<NodeRef> invalidatedNodes, List<NodeRef> preservedNodes, List<String> blockers) { }

    public Preview preview(Long instanceId, String nodeId) {
        WorkflowInstance instance = ownedInstance(instanceId);
        WorkflowRuntimeSnapshot source = sourceSnapshot(instanceId);
        FailedNodeRerunPlan plan = plan(source, nodeId);
        List<String> blockers = new java.util.ArrayList<>(plan.blockers());
        if (!RuntimeState.FAILED.name().equals(instance.getStatus())) blockers.add("运行状态尚未同步为失败，请刷新后重试");
        return new Preview(instanceId, nodeId, revision(source, nodeId), blockers.isEmpty(),
                refs(source, plan.invalidatedNodeIds()), refs(source, plan.preservedNodeIds()), List.copyOf(blockers));
    }

    @Transactional(rollbackFor = Exception.class)
    public WorkflowInstance rerun(Long instanceId, String nodeId, String expectedRevision) {
        WorkflowInstance original = ownedInstance(instanceId);
        WorkflowRuntimeSnapshot source = sourceSnapshot(instanceId);
        String revision = revision(source, nodeId);
        if (expectedRevision == null || !revision.equals(expectedRevision)) {
            throw new BusinessException(ResultCode.CONFLICT, "运行快照已变化，请重新预览重跑范围");
        }
        // 由来源和不可变快照生成固定键；双击、重试、跨标签页提交均返回同一个派生运行。
        String key = "node-rerun:" + revision;
        Long userId = AuthenticatedUserContext.requireUserId();
        WorkflowInstance existing = instanceMapper.findByUserIdAndIdempotencyKey(userId, key);
        if (existing != null) return existing;
        FailedNodeRerunPlan plan = plan(source, nodeId);
        if (!RuntimeState.FAILED.name().equals(original.getStatus()) || !plan.eligible()) {
            throw new BusinessException(ResultCode.CONFLICT, "无法局部重跑：" + String.join("；", plan.blockers()));
        }
        // 仅对失效范围执行能力预检，已复用节点不依赖其 Provider 仍然在线。
        WorkflowDefinitionDTO executable = new WorkflowDefinitionDTO();
        executable.setNodes(source.definition().getNodes().stream()
                .filter(node -> plan.invalidatedNodeIds().contains(node.getNodeId())).toList());
        workflowService.validateRuntimePreflight(executable);
        WorkflowInstance child = new WorkflowInstance();
        child.setDefinitionId(original.getDefinitionId());
        child.setUserId(userId);
        child.setIdempotencyKey(key);
        child.setInputJson(original.getInputJson());
        child.setDefinitionJson(writeJson(source.definition()));
        child.setStatus(RuntimeState.PENDING.name());
        child.setStartedAt(LocalDateTime.now());
        child.setUpdatedAt(child.getStartedAt());
        if (instanceMapper.insertIdempotent(child) != 1) {
            WorkflowInstance winner = instanceMapper.findByUserIdAndIdempotencyKey(userId, key);
            if (winner != null) return winner;
            throw new BusinessException(ResultCode.CONFLICT, "重跑请求正在创建，请使用相同预览重试");
        }
        Map<String, Object> initial = initialVariables(original, source);
        WorkflowRuntimeSnapshot seed = plan.seed(source, String.valueOf(child.getId()),
                UUID.randomUUID().toString().replace("-", ""), initial);
        snapshots.save(seed);
        WorkflowStartOutbox outbox = new WorkflowStartOutbox();
        outbox.setWorkflowInstanceId(child.getId());
        outbox.setStatus(WorkflowStartOutbox.PENDING);
        outbox.setAttemptCount(0);
        outbox.setNextAttemptAt(child.getStartedAt());
        outbox.setCreatedAt(child.getStartedAt());
        outbox.setUpdatedAt(child.getStartedAt());
        outboxMapper.insert(outbox);
        dispatchAfterCommit();
        return child;
    }

    private Map<String, Object> initialVariables(WorkflowInstance original, WorkflowRuntimeSnapshot source) {
        Map<String, Object> variables = new LinkedHashMap<>();
        if (original.getInputJson() != null && !original.getInputJson().isBlank()) {
            try {
                variables.putAll(objectMapper.readValue(original.getInputJson(), new TypeReference<Map<String, Object>>() { }));
            } catch (JsonProcessingException exception) {
                throw new BusinessException(ResultCode.CONFLICT, "原运行输入不可读取，无法安全重建变量");
            }
        }
        variables.put("userId", original.getUserId());
        variables.put("username", AuthenticatedUserContext.usernameOrDefault("aether.operator"));
        Map<String, Object> configs = new LinkedHashMap<>();
        source.definition().getNodes().forEach(node -> configs.put(node.getNodeId(), node.getConfig() == null ? Map.of() : node.getConfig()));
        variables.put(WorkflowNodeContextKeys.NODE_CONFIGS, configs);
        return variables;
    }

    private void dispatchAfterCommit() {
        Runnable dispatch = () -> {
            try {
                workflowService.dispatchPendingStarts();
            } catch (RuntimeException exception) {
                log.warn("局部重跑派发暂不可用，持久启动 Outbox 将重试", exception);
            }
        };
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            dispatch.run();
        } else {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { dispatch.run(); }
            });
        }
    }

    private WorkflowInstance ownedInstance(Long instanceId) {
        WorkflowInstance instance = instanceMapper.selectById(instanceId);
        if (instance == null || !AuthenticatedUserContext.requireUserId().equals(instance.getUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "运行不存在");
        }
        return instance;
    }

    private WorkflowRuntimeSnapshot sourceSnapshot(Long instanceId) {
        return snapshots.findByWorkflowId(String.valueOf(instanceId))
                .orElseThrow(() -> new BusinessException(ResultCode.CONFLICT, "运行没有可复用的持久快照"));
    }

    private FailedNodeRerunPlan plan(WorkflowRuntimeSnapshot source, String nodeId) {
        try {
            return FailedNodeRerunPlan.from(source, nodeId);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, exception.getMessage());
        }
    }

    private List<NodeRef> refs(WorkflowRuntimeSnapshot source, List<String> ids) {
        return source.definition().getNodes().stream().filter(node -> ids.contains(node.getNodeId()))
                .map(node -> new NodeRef(node.getNodeId(), node.getDisplayName() == null ? node.getNodeId() : node.getDisplayName())).toList();
    }

    private String revision(WorkflowRuntimeSnapshot source, String nodeId) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
                    (source.workflowId() + "\n" + source.traceId() + "\n" + source.updatedAt() + "\n" + nodeId)
                            .getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("重跑快照序列化失败", exception);
        }
    }
}
