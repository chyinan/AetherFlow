package com.aetherflow.ai.task;

// pattern: Functional Core

import java.time.Duration;

public class AiJobLeaseBusyException extends RuntimeException {

    private final Duration retryAfter;

    public AiJobLeaseBusyException(Duration retryAfter) {
        super("ai job lease is currently owned by another worker");
        this.retryAfter = retryAfter == null || retryAfter.isNegative() || retryAfter.isZero()
                ? Duration.ofSeconds(1)
                : retryAfter;
    }

    public Duration retryAfter() {
        return retryAfter;
    }
}
