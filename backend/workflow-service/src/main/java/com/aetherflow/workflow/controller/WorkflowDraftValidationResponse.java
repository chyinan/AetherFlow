package com.aetherflow.workflow.controller;

import java.util.List;

public record WorkflowDraftValidationResponse(
        boolean structurallyValid,
        boolean runtimeReady,
        List<String> issues
) {
    public WorkflowDraftValidationResponse {
        issues = issues == null ? List.of() : List.copyOf(issues);
    }
}
