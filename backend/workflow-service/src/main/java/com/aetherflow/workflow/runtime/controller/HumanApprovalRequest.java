package com.aetherflow.workflow.runtime.controller;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// pattern: Functional Core
public record HumanApprovalRequest(
        @NotNull Boolean approved,
        @Size(max = 2000) String comment,
        @Size(max = 120) String reviewer,
        @Size(max = 40) String method
) {
}
