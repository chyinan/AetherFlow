package com.aetherflow.workflow.runtime.api;

public enum RuntimeState {
    PENDING,
    RUNNING,
    RETRYING,
    WAITING,
    SUCCESS,
    FAILED,
    CANCELLED
}
