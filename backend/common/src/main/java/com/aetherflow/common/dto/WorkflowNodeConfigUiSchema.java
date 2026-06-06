package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Frontend UI metadata for rendering workflow node config fields.")
public record WorkflowNodeConfigUiSchema(
        @Schema(description = "UI placement mode.", example = "basic")
        String mode,

        @Schema(description = "Frontend control type.", example = "textarea")
        String control,

        @Schema(description = "Minimum numeric value.", example = "0")
        Number min,

        @Schema(description = "Maximum numeric value.", example = "100")
        Number max,

        @Schema(description = "Numeric step value.", example = "1")
        Number step
) {
    public static WorkflowNodeConfigUiSchema basic(String control) {
        return new WorkflowNodeConfigUiSchema("basic", control, null, null, null);
    }

    public static WorkflowNodeConfigUiSchema basicNumber(Number min, Number max, Number step) {
        return new WorkflowNodeConfigUiSchema("basic", "number", min, max, step);
    }

    public static WorkflowNodeConfigUiSchema advanced(String control) {
        return new WorkflowNodeConfigUiSchema("advanced", control, null, null, null);
    }

    public static WorkflowNodeConfigUiSchema advancedNumber(Number min, Number max, Number step) {
        return new WorkflowNodeConfigUiSchema("advanced", "number", min, max, step);
    }
}
