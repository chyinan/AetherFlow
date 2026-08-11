package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.NotifyInternalClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeWaitingException;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

// pattern: Imperative Shell
@Component
public class HumanInterventionNodeExecutor extends BaseNodeExecutor {

    private final WorkflowNodeProperties properties;
    private final NotifyInternalClient notifyClient;

    public HumanInterventionNodeExecutor(WorkflowNodeMetrics metrics,
                                         WorkflowNodeProperties properties,
                                         NotifyInternalClient notifyClient) {
        super(WorkflowNodeTypes.HUMAN, metrics);
        this.properties = properties;
        this.notifyClient = notifyClient;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        boolean autoApprove = NodeValueSupport.booleanValue(config.get("autoApprove"), properties.isHumanAutoApproveEnabled());
        if (!autoApprove) {
            Map<String, Object> pendingApproval = new LinkedHashMap<>();
            pendingApproval.put("approved", false);
            pendingApproval.put("approvalStatus", "pending");
            pendingApproval.put("workflowId", context.workflowId());
            pendingApproval.put("nodeId", context.currentNodeId());
            pendingApproval.put("reviewer", NodeValueSupport.stringValue(config.get("reviewer"), ""));
            String methods = methods(config.get("methods"));
            pendingApproval.put("method", methods);
            notifyApprovalRequest(context, config, methods);
            throw new NodeWaitingException(pendingApproval);
        }
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("approved", true);
        output.put("approvalStatus", "approved");
        output.put("reviewer", NodeValueSupport.stringValue(config.get("reviewer"), "auto"));
        output.put("method", NodeValueSupport.stringValue(config.get("methods"), "auto"));
        return buildResult(output, Map.of("approved", true, "approval", output));
    }

    private void notifyApprovalRequest(WorkflowContext context, Map<String, Object> config, String methods) {
        Long userId = longValue(context.variables().get("userId"));
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "human node userId is required");
        }

        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(userId);
        message.setTraceId(context.traceId());
        message.setEventId("human:approval:" + context.workflowId() + ":" + context.currentNodeId() + ":" + context.taskId());
        message.setChannel("WORKFLOW");
        message.setEventType("HUMAN_APPROVAL_REQUIRED");
        message.setPayload(notificationPayload(context, config, methods));
        message.setOccurredAt(OffsetDateTime.now());

        Result<Void> result = notifyClient.send(message);
        if (result == null || !result.isSuccess()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "human approval notification failed");
        }
    }

    private Map<String, Object> notificationPayload(WorkflowContext context,
                                                     Map<String, Object> config,
                                                     String methods) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", "Human approval required");
        payload.put("message", "Workflow " + context.workflowId() + " is waiting for approval at node " + context.currentNodeId());
        payload.put("workflowId", context.workflowId());
        payload.put("traceId", context.traceId());
        payload.put("taskId", context.taskId());
        payload.put("nodeId", context.currentNodeId());
        payload.put("methods", methods);
        payload.put("reviewer", NodeValueSupport.stringValue(config.get("reviewer"), ""));
        String draftVariable = NodeValueSupport.stringValue(config.get("draftVariable"), "draft");
        Object draft = context.variables().get(draftVariable);
        if (draft != null) {
            payload.put("draft", draft);
        }
        return payload;
    }

    private String methods(Object value) {
        String configured = NodeValueSupport.stringValue(value, "webapp");
        String normalized = Arrays.stream(configured.split(","))
                .map(String::trim)
                .filter(method -> !method.isBlank())
                .distinct()
                .collect(Collectors.joining(","));
        return normalized.isBlank() ? "webapp" : normalized;
    }

    private Long longValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
