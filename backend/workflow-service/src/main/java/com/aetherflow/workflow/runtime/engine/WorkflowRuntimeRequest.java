package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.runtime.api.RetryPolicy;

import java.util.Map;
import java.util.Objects;
import java.util.LinkedHashMap;
import java.util.Collections;

public record WorkflowRuntimeRequest(
        String workflowId,
        String traceId,
        String taskId,
        Long definitionId,
        WorkflowDefinitionDTO definition,
        Map<String, Object> variables,
        RetryPolicy retryPolicy
) {

    // pattern: Functional Core

    public WorkflowRuntimeRequest {
        workflowId = requireText(workflowId, "workflowId");
        traceId = requireText(traceId, "traceId");
        taskId = requireText(taskId, "taskId");
        definition = Objects.requireNonNull(definition, "definition must not be null");
        if (variables == null || variables.isEmpty()) {
            variables = Map.of();
        } else {
            Map<String, Object> safeVariables = new LinkedHashMap<>();
            variables.forEach((key, value) -> {
                if (key != null) {
                    safeVariables.put(key, value);
                }
            });
            variables = Collections.unmodifiableMap(safeVariables);
        }
        retryPolicy = retryPolicy == null ? RetryPolicy.none() : retryPolicy;
    }

    public WorkflowRuntimeRequest(String workflowId,
                                  String traceId,
                                  String taskId,
                                  WorkflowDefinitionDTO definition,
                                  Map<String, Object> variables,
                                  RetryPolicy retryPolicy) {
        this(workflowId, traceId, taskId, null, definition, variables, retryPolicy);
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " must not be blank");
        }
        return value;
    }
}
