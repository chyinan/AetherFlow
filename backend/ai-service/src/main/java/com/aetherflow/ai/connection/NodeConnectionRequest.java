package com.aetherflow.ai.connection;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public record NodeConnectionRequest(
        @NotBlank @Size(max = 80) String name,
        @NotBlank String provider,
        @NotBlank @Size(max = 2048) String baseUrl,
        List<String> workflowNodeTypes) {
    public NodeConnectionRequest { workflowNodeTypes = workflowNodeTypes == null ? List.of() : List.copyOf(workflowNodeTypes); }
    public NodeConnectionRequest(String name, String provider, String baseUrl) { this(name, provider, baseUrl, List.of()); }
}
