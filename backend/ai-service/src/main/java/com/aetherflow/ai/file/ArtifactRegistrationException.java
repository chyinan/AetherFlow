package com.aetherflow.ai.file;

// pattern: Imperative Shell

public final class ArtifactRegistrationException extends RuntimeException {

    private final String batchId;
    private final int expectedCount;

    public ArtifactRegistrationException(String batchId, int expectedCount, Throwable cause) {
        super("generated artifact registration failed for batch " + batchId, cause);
        this.batchId = batchId;
        this.expectedCount = expectedCount;
    }

    public String batchId() {
        return batchId;
    }

    public int expectedCount() {
        return expectedCount;
    }
}
