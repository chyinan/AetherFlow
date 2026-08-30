package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

// pattern: Imperative Shell
@Component
@RequiredArgsConstructor
public class AsyncAiTaskDispatcher {

    private final TaskClient taskClient;
    private final TaskClientProperties credentials;
    private final WorkflowNodeProperties nodeProperties;

    public boolean isEnabled() {
        return nodeProperties.isAsyncAiEnabled();
    }

    public long dispatch(WorkflowContext context, String nodeType, Map<String, Object> payload) {
        long workflowInstanceId;
        try {
            workflowInstanceId = Long.parseLong(context.workflowId());
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("async AI requires a numeric workflow instance id", exception);
        }
        TaskMessageDTO message = new TaskMessageDTO();
        message.setWorkflowInstanceId(workflowInstanceId);
        Object userId = context.variables().get("userId");
        if (userId instanceof Number number) {
            message.setUserId(number.longValue());
        } else if (userId instanceof String text && !text.isBlank()) {
            try {
                message.setUserId(Long.parseLong(text));
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("workflow userId variable must be numeric", exception);
            }
        }
        message.setTraceId(context.traceId());
        message.setNodeId(context.currentNodeId());
        message.setNodeType(nodeType);
        message.setIdempotencyKey(idempotencyKey(context, nodeType));
        message.setPayload(payload == null ? Map.of() : Map.copyOf(payload));
        message.setEnqueue(true);
        Result<Long> result = taskClient.dispatch(credentials.issueInternalToken(), message);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new IllegalStateException("task-service async AI dispatch failed");
        }
        return result.getData();
    }

    private String idempotencyKey(WorkflowContext context, String nodeType) {
        Object iteration = context.variables().get("iterationIndex");
        String iterationPart = iteration == null ? "root" : String.valueOf(iteration);
        return String.join(":", "workflow-ai", context.workflowId(), context.traceId(),
                context.currentNodeId(), nodeType == null ? "" : nodeType, iterationPart);
    }
}
