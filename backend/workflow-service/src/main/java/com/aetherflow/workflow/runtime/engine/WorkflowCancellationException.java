package com.aetherflow.workflow.runtime.engine;

// pattern: Functional Core

public final class WorkflowCancellationException extends RuntimeException {

    public WorkflowCancellationException(String workflowId) {
        super("workflow cancelled: " + workflowId);
    }
}
