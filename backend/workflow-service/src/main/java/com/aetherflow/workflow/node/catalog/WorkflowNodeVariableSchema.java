package com.aetherflow.workflow.node.catalog;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Workflow node input or output variable descriptor.")
public record WorkflowNodeVariableSchema(
        @Schema(description = "Variable name.", example = "fileUrl")
        String name,

        @Schema(description = "Variable value type.", example = "STRING")
        String type,

        @Schema(description = "Variable description.", example = "Public URL of the uploaded file.")
        String description,

        @Schema(description = "Example value.", example = "http://minio/aetherflow/audio.mp3")
        Object example
) {
}
