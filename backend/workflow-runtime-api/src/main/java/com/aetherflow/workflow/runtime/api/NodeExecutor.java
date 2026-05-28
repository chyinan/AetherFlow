package com.aetherflow.workflow.runtime.api;

public interface NodeExecutor {

    NodeType nodeType();

    NodeResult execute(WorkflowContext context) throws Exception;
}
