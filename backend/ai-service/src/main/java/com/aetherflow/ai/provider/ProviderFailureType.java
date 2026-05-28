package com.aetherflow.ai.provider;

public enum ProviderFailureType {
    TIMEOUT(true, true),
    RATE_LIMITED(true, true),
    SERVER_ERROR(true, true),
    CONNECTION_ERROR(true, true),
    EMPTY_RESPONSE(true, true),
    INVALID_RESPONSE(false, false),
    BLOCKED(true, true),
    PROVIDER_UNAVAILABLE(true, true),
    UNSUPPORTED(false, false),
    UNKNOWN(true, true);

    private final boolean retryable;
    private final boolean circuitEligible;

    ProviderFailureType(boolean retryable, boolean circuitEligible) {
        this.retryable = retryable;
        this.circuitEligible = circuitEligible;
    }

    public boolean isRetryable() {
        return retryable;
    }

    public boolean isCircuitEligible() {
        return circuitEligible;
    }
}
