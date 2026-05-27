package com.aetherflow.ai.cache;

public final class AiTaskCacheKeys {

    private static final String PREFIX = "aetherflow:ai:task:";

    private AiTaskCacheKeys() {
    }

    public static String statusKey(Long taskId) {
        return PREFIX + taskId + ":status";
    }

    public static String resultKey(Long taskId) {
        return PREFIX + taskId + ":result";
    }

    public static String errorKey(Long taskId) {
        return PREFIX + taskId + ":error";
    }
}
