package com.aetherflow.workflow.runtime.api;

@FunctionalInterface
public interface NodeExecutor {

    NodeResult execute(WorkflowContext context) throws Exception;

    default NodeType nodeType() {
        throw new UnsupportedOperationException("nodeType must be implemented by node executors");
    }
}
