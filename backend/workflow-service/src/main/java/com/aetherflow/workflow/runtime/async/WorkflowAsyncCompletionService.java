package com.aetherflow.workflow.runtime.async;

import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.node.executor.AiWorkflowNodeResultAdapter;
import com.aetherflow.workflow.node.executor.ImageWorkflowNodeResultFinisher;
import com.aetherflow.workflow.runtime.controller.HumanApprovalRequest;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

// pattern: Imperative Shell
@Service
@RequiredArgsConstructor
public class WorkflowAsyncCompletionService {

    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowRuntimeEngine runtimeEngine;
    private final WorkflowRuntimeProperties runtimeProperties;
    private final WorkflowInstanceMapper instanceMapper;

    @Autowired(required = false)
    private ImageWorkflowNodeResultFinisher imageResultFinisher;

    public WorkflowExecutionSnapshot completeApproval(Long workflowInstanceId,
                                                       String nodeId,
                                                       HumanApprovalRequest approval) {
        if (approval == null || approval.approved() == null) {
            throw new IllegalArgumentException("approval decision is required");
        }
        WorkflowRuntimeSnapshot stored = storedSnapshot(workflowInstanceId);
        if (!isHumanNode(stored, nodeId)) {
            throw new IllegalArgumentException("node is not a waiting human approval node: " + nodeId);
        }

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("approved", approval.approved());
        output.put("approvalStatus", approval.approved() ? "approved" : "rejected");
        output.put("reviewer", textOr(approval.reviewer(), "unknown"));
        output.put("method", textOr(approval.method(), "webapp"));
        if (approval.comment() != null && !approval.comment().isBlank()) {
            output.put("comment", approval.comment().trim());
        }
        output.put("approvedAt", Instant.now().toString());
        if (!approval.approved() && !allowsRejectedBranch(stored, nodeId)) {
            String comment = approval.comment() == null ? "" : approval.comment().trim();
            String reason = comment.isBlank()
                    ? "human approval rejected"
                    : "human approval rejected: " + comment;
            return completeFailure(workflowInstanceId, nodeId, reason);
        }
        return completeSuccess(workflowInstanceId, nodeId, output);
    }

    public WorkflowExecutionSnapshot completeSuccess(Long workflowInstanceId,
                                                      String nodeId,
                                                      Map<String, Object> output) {
        return completeSuccess(workflowInstanceId, nodeId, null, output);
    }

    public WorkflowExecutionSnapshot completeSuccess(Long workflowInstanceId,
                                                      String nodeId,
                                                      Long expectedExternalTaskId,
                                                      Map<String, Object> output) {
        if (workflowInstanceId == null || workflowInstanceId <= 0) {
            throw new IllegalArgumentException("workflow instance id must be positive");
        }
        Map<String, Object> safeOutput = output == null ? Map.of() : output;
        WorkflowExecutionSnapshot completed = expectedExternalTaskId == null
                ? runtimeEngine.completeWaitingNode(
                String.valueOf(workflowInstanceId), nodeId,
                stored -> adaptResult(stored, nodeId, safeOutput),
                runtimeProperties.getRetry().toRetryPolicy())
                : runtimeEngine.completeWaitingNode(
                String.valueOf(workflowInstanceId), nodeId, expectedExternalTaskId,
                stored -> adaptResult(stored, nodeId, safeOutput),
                runtimeProperties.getRetry().toRetryPolicy());
        updateInstance(workflowInstanceId, completed);
        return completed;
    }

    public WorkflowExecutionSnapshot completeFailure(Long workflowInstanceId,
                                                      String nodeId,
                                                      String error) {
        return completeFailure(workflowInstanceId, nodeId, null, error);
    }

    public WorkflowExecutionSnapshot completeFailure(Long workflowInstanceId,
                                                      String nodeId,
                                                      Long expectedExternalTaskId,
                                                      String error) {
        if (workflowInstanceId == null || workflowInstanceId <= 0) {
            throw new IllegalArgumentException("workflow instance id must be positive");
        }
        WorkflowExecutionSnapshot failed = expectedExternalTaskId == null
                ? runtimeEngine.failWaitingNode(
                String.valueOf(workflowInstanceId), nodeId, error,
                runtimeProperties.getRetry().toRetryPolicy())
                : runtimeEngine.failWaitingNode(
                String.valueOf(workflowInstanceId), nodeId, expectedExternalTaskId, error,
                runtimeProperties.getRetry().toRetryPolicy());
        updateInstance(workflowInstanceId, failed);
        return failed;
    }

    private void updateInstance(Long workflowInstanceId, WorkflowExecutionSnapshot snapshot) {
        LocalDateTime updatedAt = LocalDateTime.now();
        instanceMapper.transitionRuntimeState(
                workflowInstanceId,
                snapshot.runtimeState().name(),
                snapshot.currentNodeId(),
                isTerminal(snapshot.runtimeState()) ? updatedAt : null,
                updatedAt);
    }

    private boolean isTerminal(RuntimeState state) {
        return state == RuntimeState.SUCCESS
                || state == RuntimeState.FAILED
                || state == RuntimeState.CANCELLED;
    }

    private WorkflowRuntimeSnapshot storedSnapshot(Long workflowInstanceId) {
        if (workflowInstanceId == null || workflowInstanceId <= 0) {
            throw new IllegalArgumentException("workflow instance id must be positive");
        }
        return snapshotRepository.findByWorkflowId(String.valueOf(workflowInstanceId))
                .orElseThrow(() -> new IllegalStateException(
                        "workflow runtime snapshot not found: " + workflowInstanceId));
    }

    private boolean isHumanNode(WorkflowRuntimeSnapshot snapshot, String nodeId) {
        if (nodeId == null || snapshot.runtimeState() != RuntimeState.WAITING
                || !snapshot.currentNodeIds().contains(nodeId)
                || snapshot.definition().getNodes() == null) {
            return false;
        }
        return snapshot.definition().getNodes().stream()
                .filter(node -> nodeId.equals(node.getNodeId()))
                .map(WorkflowNodeDTO::getNodeType)
                .anyMatch(type -> "HUMAN".equalsIgnoreCase(type));
    }

    private String nodeType(WorkflowRuntimeSnapshot snapshot, String nodeId) {
        if (nodeId == null || snapshot.definition().getNodes() == null) {
            return "";
        }
        return snapshot.definition().getNodes().stream()
                .filter(node -> nodeId.equals(node.getNodeId()))
                .map(WorkflowNodeDTO::getNodeType)
                .filter(type -> type != null && !type.isBlank())
                .findFirst()
                .orElse("");
    }

    private NodeResult adaptResult(WorkflowRuntimeSnapshot snapshot,
                                   String nodeId,
                                   Map<String, Object> output) {
        String type = nodeType(snapshot, nodeId);
        if (imageResultFinisher != null && imageResultFinisher.supports(type)) {
            return imageResultFinisher.finish(type, snapshot.workflowId(), nodeId,
                    snapshot.variables(), output);
        }
        return AiWorkflowNodeResultAdapter.adapt(type, output);
    }

    private boolean allowsRejectedBranch(WorkflowRuntimeSnapshot snapshot, String nodeId) {
        return snapshot.definition().getNodes().stream()
                .filter(node -> nodeId.equals(node.getNodeId()))
                .map(WorkflowNodeDTO::getConfig)
                .filter(config -> config != null)
                .map(config -> config.get("rejectBehavior"))
                .map(String::valueOf)
                .anyMatch("BRANCH"::equalsIgnoreCase);
    }

    private String textOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private Long userId(Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("userId");
        if (value instanceof Number number && number.longValue() > 0) {
            return number.longValue();
        }
        if (value != null) {
            try {
                long parsed = Long.parseLong(String.valueOf(value));
                if (parsed > 0) {
                    return parsed;
                }
            } catch (NumberFormatException ignored) {
                // Fall through to the explicit authentication error.
            }
        }
        throw new com.aetherflow.common.exception.BusinessException(
                com.aetherflow.common.core.ResultCode.UNAUTHORIZED,
                "authenticated user is required for workflow completion");
    }

    private String username(Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("username");
        return value == null || String.valueOf(value).isBlank() ? "aether.operator" : String.valueOf(value).trim();
    }
}
