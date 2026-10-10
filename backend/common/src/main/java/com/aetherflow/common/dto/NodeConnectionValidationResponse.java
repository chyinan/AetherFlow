package com.aetherflow.common.dto;

import java.util.List;

// pattern: Functional Core
public record NodeConnectionValidationResponse(List<String> violations) {
    public NodeConnectionValidationResponse {
        violations = violations == null ? List.of() : List.copyOf(violations);
    }
}
