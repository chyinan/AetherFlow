package com.aetherflow.workflow.node.catalog;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;
import java.util.Map;

@Schema(description = "Workflow node catalog item for frontend node palette and inspector forms.")
public record WorkflowNodeCatalogItem(
        @Schema(description = "Stable node type used in WorkflowNodeDTO.nodeType.", example = "WHISPER")
        String type,

        @Schema(description = "Display name for frontend node palette.", example = "Whisper Transcription")
        String displayName,

        @Schema(description = "Node category.", example = "AI")
        String category,

        @Schema(description = "Node behavior summary.",
                example = "Transcribes an uploaded audio or video file through ai-service.")
        String description,

        @Schema(description = "Config schema used by frontend to render the node inspector form.")
        List<WorkflowNodeConfigSchema> configSchema,

        @Schema(description = "Variables usually consumed by this node.")
        List<WorkflowNodeVariableSchema> inputVariables,

        @Schema(description = "Variables produced by this node after successful execution.")
        List<WorkflowNodeVariableSchema> outputVariables,

        @Schema(description = "Example config object stored in WorkflowNodeDTO.config.")
        Map<String, Object> exampleConfig
) {
}
