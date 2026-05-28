package com.aetherflow.workflow.runtime.api;

import java.time.Duration;
import java.util.Objects;

public record RetryPolicy(
        int maxAttempts,
        Duration initialDelay,
        double backoffMultiplier,
        Duration maxDelay
) {

    public RetryPolicy {
        if (maxAttempts < 1) {
            throw new IllegalArgumentException("max attempts must be at least 1");
        }
        Objects.requireNonNull(initialDelay, "initialDelay must not be null");
        Objects.requireNonNull(maxDelay, "maxDelay must not be null");
        if (initialDelay.isNegative() || maxDelay.isNegative()) {
            throw new IllegalArgumentException("retry delays must not be negative");
        }
        if (backoffMultiplier < 1.0D) {
            throw new IllegalArgumentException("backoff multiplier must be at least 1.0");
        }
    }

    public static RetryPolicy none() {
        return of(1, Duration.ZERO, 1.0D, Duration.ZERO);
    }

    public static RetryPolicy of(int maxAttempts,
                                 Duration initialDelay,
                                 double backoffMultiplier,
                                 Duration maxDelay) {
        return new RetryPolicy(maxAttempts, initialDelay, backoffMultiplier, maxDelay);
    }

    public boolean shouldRetry(int attempt, Throwable throwable) {
        return throwable != null && attempt < maxAttempts;
    }

    public Duration delayForAttempt(int attempt) {
        if (attempt < 1) {
            throw new IllegalArgumentException("attempt must be at least 1");
        }
        if (initialDelay.isZero()) {
            return Duration.ZERO;
        }
        double factor = Math.pow(backoffMultiplier, attempt - 1);
        long delayMillis = Math.round(initialDelay.toMillis() * factor);
        return Duration.ofMillis(Math.min(delayMillis, maxDelay.toMillis()));
    }
}
