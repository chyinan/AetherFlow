package com.aetherflow.ai.task;

// pattern: Functional Core
public final class AiTaskStatus {

    public static final String RUNNING = "RUNNING";
    public static final String RETRYING = "RETRYING";
    public static final String SUCCEEDED = "SUCCEEDED";
    public static final String FAILED = "FAILED";

    private AiTaskStatus() {
    }
}
