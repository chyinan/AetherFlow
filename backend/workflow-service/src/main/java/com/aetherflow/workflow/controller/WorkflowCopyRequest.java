package com.aetherflow.workflow.controller;

// pattern: Functional Core

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class WorkflowCopyRequest {

    @Size(max = 128)
    private String name;
}
