package com.aetherflow.workflow.controller;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkflowNodeRerunRequest(@NotBlank @Size(max = 128) String expectedRevision) {
}
