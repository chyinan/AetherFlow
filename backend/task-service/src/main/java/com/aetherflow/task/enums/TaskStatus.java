package com.aetherflow.task.enums;

import java.util.Locale;

public enum TaskStatus {

    PENDING,
    QUEUED,
    DISPATCHING,
    DISPATCHED,
    RETRYING,
    TIMEOUT,
    FAILED,
    SUCCEEDED;

    public String value() {
        return name();
    }

    public boolean terminal() {
        return this == FAILED || this == SUCCEEDED;
    }

    public static TaskStatus from(String value) {
        if (value == null || value.isBlank()) {
            return PENDING;
        }
        return TaskStatus.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
