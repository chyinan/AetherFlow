package com.aetherflow.workflow.controller;

// pattern: Imperative Shell

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

@Data
@Schema(description = "Request body for starting a workflow instance.")
public class StartWorkflowRequest {

    @Schema(description = "User id that owns the workflow instance.", example = "10001")
    private Long userId;

    @Schema(description = "Operation-level idempotency key. Reusing it for the same authenticated user returns the original instance.", example = "workflow-start:order-20260901-001")
    private String idempotencyKey;

    @Schema(description = "Initial workflow variables.", example = "{\"fileId\":1001,\"userId\":10001}")
    private Map<String, Object> input;
}

