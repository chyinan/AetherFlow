package com.aetherflow.workflow.runtime.core;

import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;

import java.util.Collections;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicReference;

public class DefaultWorkflowContext implements WorkflowContext {

    private final String workflowId;
    private final String traceId;
    private final String taskId;
    private final ConcurrentMap<String, Object> variables = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, NodeResult> nodeOutputs = new ConcurrentHashMap<>();
    private final AtomicReference<RuntimeState> runtimeState = new AtomicReference<>(RuntimeState.PENDING);
    private final AtomicReference<String> currentNodeId = new AtomicReference<>();

    public DefaultWorkflowContext(String workflowId,
                                  String traceId,
                                  String taskId,
                                  Map<String, Object> initialVariables) {
        this.workflowId = requireText(workflowId, "workflowId");
        this.traceId = requireText(traceId, "traceId");
        this.taskId = requireText(taskId, "taskId");
        if (initialVariables != null) {
            variables.putAll(initialVariables);
        }
    }

    @Override
    public String workflowId() {
        return workflowId;
    }

    @Override
    public String traceId() {
        return traceId;
    }

    @Override
    public String taskId() {
        return taskId;
    }

    @Override
    public Map<String, Object> variables() {
        return variables;
    }

    @Override
    public Map<String, NodeResult> nodeOutputs() {
        return Collections.unmodifiableMap(Map.copyOf(nodeOutputs));
    }

    @Override
    public RuntimeState runtimeState() {
        return runtimeState.get();
    }

    @Override
    public String currentNodeId() {
        return currentNodeId.get();
    }

    public void updateRuntimeState(RuntimeState state) {
        runtimeState.set(Objects.requireNonNull(state, "state must not be null"));
    }

    public void updateCurrentNodeId(String nodeId) {
        currentNodeId.set(nodeId);
    }

    public void recordNodeOutput(String nodeId, NodeResult result) {
        nodeOutputs.put(requireText(nodeId, "nodeId"), Objects.requireNonNull(result, "result must not be null"));
    }

    private static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " must not be blank");
        }
        return value;
    }
}
