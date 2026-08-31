package com.aetherflow.workflow.runtime.engine;

// pattern: Functional Core

@FunctionalInterface
public interface WorkflowCancellationProbe {

    boolean isCancelled(String workflowId);

    static WorkflowCancellationProbe noop() {
        return workflowId -> false;
    }
}
