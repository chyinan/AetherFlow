package com.aetherflow.workflow.node.catalog;

import com.aetherflow.common.dto.WorkflowNodeConfigUiSchema;
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
        List<String> options,

        @Schema(description = "Optional frontend UI metadata for rendering this config field.")
        WorkflowNodeConfigUiSchema ui
) {
    public WorkflowNodeConfigSchema(String name,
                                    String type,
                                    boolean required,
                                    String description,
                                    Object example,
                                    List<String> options) {
        this(name, type, required, description, example, options, null);
    }
}
