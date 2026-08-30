package com.aetherflow.workflow.runtime.stream;

// pattern: Functional Core
import java.time.Instant;
import java.util.List;

public record WorkflowStreamTokenResponse(
        String token,
        String tokenType,
        Long userId,
        String workflowId,
        Instant expiresAt,
        Long expiresInSeconds,
        List<String> transports,
        String queryParam
) {
    public WorkflowStreamTokenResponse {
        transports = transports == null ? List.of() : List.copyOf(transports);
    }
}
