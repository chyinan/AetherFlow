package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.NotifyInternalClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class NotifyNodeExecutor extends BaseNodeExecutor {

    private final NotifyInternalClient notifyClient;

    public NotifyNodeExecutor(WorkflowNodeMetrics metrics, NotifyInternalClient notifyClient) {
        super(WorkflowNodeTypes.NOTIFY, metrics);
        this.notifyClient = notifyClient;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Long userId = longValue(config.getOrDefault("userId", context.variables().get("userId")));
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "notify node userId is required");
        }
        String channel = stringValue(config.get("channel"), "WORKFLOW");
        String eventType = stringValue(config.get("eventType"), "WORKFLOW_COMPLETED");
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(userId);
        message.setChannel(channel);
        message.setEventType(eventType);
        message.setPayload(payload(context, config));
        message.setOccurredAt(OffsetDateTime.now());
        Result<Void> result = notifyClient.send(message);
        if (result == null || !result.isSuccess()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "workflow notification failed");
        }
        return buildResult(Map.of(
                "notified", true,
                "channel", channel,
                "eventType", eventType
        ), Map.of());
    }

    private Map<String, Object> payload(WorkflowContext context, Map<String, Object> config) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.putAll(context.variables());
        payload.remove(WorkflowNodeContextKeys.NODE_CONFIGS);
        payload.putAll(asMap(config.get("payload")));
        payload.put("workflowId", context.workflowId());
        payload.put("traceId", context.traceId());
        payload.put("taskId", context.taskId());
        payload.put("nodeId", context.currentNodeId());
        return payload;
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

    private String stringValue(Object value, String defaultValue) {
        if (value == null || String.valueOf(value).isBlank()) {
            return defaultValue;
        }
        return String.valueOf(value);
    }
}
