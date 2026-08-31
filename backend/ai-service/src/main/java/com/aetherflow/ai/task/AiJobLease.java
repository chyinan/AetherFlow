package com.aetherflow.ai.task;

// pattern: Functional Core

import java.time.LocalDateTime;

public record AiJobLease(Long jobId, String token, LocalDateTime expiresAt) {
}
