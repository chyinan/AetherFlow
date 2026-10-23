package com.aetherflow.workflow.runtime.cancellation;

import java.time.LocalDateTime;

public record WorkflowCancellationCleanupStatus(
        Long workflowInstanceId,
        String status,
        int attemptCount,
        String lastError,
        LocalDateTime nextAttemptAt,
        LocalDateTime completedAt,
        boolean retryable
) { }
