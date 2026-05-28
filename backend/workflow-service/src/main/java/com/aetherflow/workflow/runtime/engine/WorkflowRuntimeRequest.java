package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.runtime.api.RetryPolicy;

import java.util.Map;
import java.util.Objects;

public record WorkflowRuntimeRequest(
        String workflowId,
        String traceId,
        String taskId,
        WorkflowDefinitionDTO definition,
        Map<String, Object> variables,
        RetryPolicy retryPolicy
) {

    public WorkflowRuntimeRequest {
        workflowId = requireText(workflowId, "workflowId");
        traceId = requireText(traceId, "traceId");
        taskId = requireText(taskId, "taskId");
        definition = Objects.requireNonNull(definition, "definition must not be null");
        variables = variables == null ? Map.of() : Map.copyOf(variables);
        retryPolicy = retryPolicy == null ? RetryPolicy.none() : retryPolicy;
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " must not be blank");
        }
        return value;
    }
}
