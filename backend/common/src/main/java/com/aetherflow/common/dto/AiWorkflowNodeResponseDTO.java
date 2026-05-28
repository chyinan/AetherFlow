package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Internal AI workflow node execution response.")
public class AiWorkflowNodeResponseDTO {

    @Schema(description = "Normalized workflow node type.", example = "SUMMARY")
    private String nodeType;

    @Schema(description = "Execution status returned by ai-service node executor.", example = "SUCCEEDED")
    private String status;

    @Schema(description = "Node output map consumed by workflow-service.", example = "{\"summary\":\"Meeting action items\"}")
    private Map<String, Object> output;
}
