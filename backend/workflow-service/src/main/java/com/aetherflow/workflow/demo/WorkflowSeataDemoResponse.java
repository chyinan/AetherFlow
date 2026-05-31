package com.aetherflow.workflow.demo;

public record WorkflowSeataDemoResponse(
        Long workflowInstanceId,
        Long taskId,
        int holdSeconds,
        boolean rollbackRequested
) {
}
