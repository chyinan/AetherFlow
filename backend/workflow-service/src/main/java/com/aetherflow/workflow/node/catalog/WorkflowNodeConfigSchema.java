package com.aetherflow.workflow.node.catalog;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Workflow node config field schema for frontend form rendering.")
public record WorkflowNodeConfigSchema(
        @Schema(description = "Config key.", example = "fileIdVariable")
        String name,

        @Schema(description = "Frontend input type.", example = "STRING")
        String type,

        @Schema(description = "Whether the field must be provided.", example = "false")
        boolean required,

        @Schema(description = "Human readable field description.",
                example = "Workflow variable name that contains the uploaded file id.")
        String description,

        @Schema(description = "Example field value.", example = "fileId")
        Object example,

        @Schema(description = "Allowed values for enum-like fields.", example = "[\"MARKDOWN\",\"TXT\",\"JSON\"]")
        List<String> options
) {
}
