package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

@Data
@Schema(description = "Internal request from workflow-service to ai-service for AI workflow node execution.")
public class AiWorkflowNodeRequestDTO {

    @NotBlank
    @Schema(description = "Workflow instance id.", example = "workflow-1001")
    private String workflowId;

    @NotBlank
    @Schema(description = "Trace id propagated from workflow runtime.", example = "trace-abc123")
    private String traceId;

    @Schema(description = "Task id that started the workflow execution.", example = "task-1001")
    private String taskId;

    @NotBlank
    @Schema(description = "Current workflow node id.", example = "node-summary-1")
    private String nodeId;

    @NotBlank
    @Schema(description = "AI node type. WHISPER is routed to the ASR executor.", example = "SUMMARY")
    private String nodeType;

    @Schema(description = "Node execution payload.", example = "{\"text\":\"long transcript\",\"language\":\"Chinese\"}")
    private Map<String, Object> payload;
}
