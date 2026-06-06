package com.aetherflow.workflow.importer;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "Request for importing a ComfyUI workflow.json into an AetherFlow DAG.")
public class ComfyUiWorkflowImportRequest {

    @Schema(description = "Imported workflow name.", example = "Imported ComfyUI workflow")
    private String name;

    @Schema(description = "Imported workflow description.", example = "Imported from ComfyUI workflow.json")
    private String description;

    @Schema(description = "Optional owning project id.", example = "7")
    private Long projectId;

    @NotNull
    @Schema(description = "ComfyUI workflow JSON object.")
    private Object workflowJson;
}
