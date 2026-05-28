package com.aetherflow.workflow.runtime.lock;

import java.time.Duration;

public record WorkflowRuntimeLockLease(
        String workflowId,
        String token,
        Duration ttl
) {

    public WorkflowRuntimeLockLease {
        if (workflowId == null || workflowId.isBlank()) {
            throw new IllegalArgumentException("workflowId must not be blank");
        }
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("token must not be blank");
        }
        ttl = ttl == null ? Duration.ZERO : ttl;
    }
}
