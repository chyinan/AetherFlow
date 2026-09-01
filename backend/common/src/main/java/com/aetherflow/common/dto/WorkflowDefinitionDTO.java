package com.aetherflow.common.dto;

// pattern: Imperative Shell

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "Workflow definition request used by the frontend workflow builder.")
public class WorkflowDefinitionDTO {

    @NotBlank
    @Schema(description = "Workflow definition name.", example = "Media digest workflow")
    private String name;

    @Schema(description = "Optional workflow description.", example = "Upload media, transcribe, summarize, export and notify the user.")
    private String description;

    @Schema(description = "Optional owning project id.", example = "7")
    private Long projectId;

    @Schema(description = "Operation-level idempotency key scoped to the authenticated owner.", example = "workflow-definition:media-digest-v1")
    private String idempotencyKey;

    @NotEmpty
    @Schema(description = "Workflow nodes in DAG order or graph declaration.")
    private List<WorkflowNodeDTO> nodes;
}

