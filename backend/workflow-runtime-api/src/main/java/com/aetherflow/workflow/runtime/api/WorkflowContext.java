package com.aetherflow.workflow.runtime.api;

import java.util.Map;

public interface WorkflowContext {

    String workflowId();

    String traceId();

    String taskId();

    Map<String, Object> variables();

    Map<String, NodeResult> nodeOutputs();

    RuntimeState runtimeState();

    String currentNodeId();
}
