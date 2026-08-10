package com.aetherflow.workflow.runtime.api;

public enum RuntimeEventType {
    WORKFLOW_STARTED,
    NODE_STARTED,
    NODE_COMPLETED,
    NODE_RETRYING,
    NODE_WAITING,
    WORKFLOW_WAITING,
    WORKFLOW_COMPLETED,
    WORKFLOW_FAILED,
    WORKFLOW_CANCELLED
}
