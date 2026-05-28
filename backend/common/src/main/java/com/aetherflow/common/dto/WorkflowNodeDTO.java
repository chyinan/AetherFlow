package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

@Data
@Schema(description = "Workflow node definition used by runtime and frontend workflow designer.")
public class WorkflowNodeDTO {

    @Schema(description = "Frontend-stable node id inside one workflow definition.", example = "node-whisper-1")
    private String nodeId;

    @Schema(description = "Node type. See GET /workflow/node/catalog for supported types.", example = "WHISPER")
    private String nodeType;

    @Schema(description = "Human readable node label shown in the workflow canvas.", example = "Transcribe uploaded file")
    private String displayName;

    @Schema(description = "Node-specific config object. See GET /workflow/node/catalog for config schema.",
            example = "{\"fileUrlVariable\":\"fileUrl\",\"language\":\"auto\"}")
    private Map<String, Object> config;
}

