package com.aetherflow.workflow.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.importer.ComfyUiWorkflowImportRequest;
import com.aetherflow.workflow.importer.ComfyUiWorkflowImportService;
import com.aetherflow.workflow.service.WorkflowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Workflow", description = "Frontend public APIs for workflow definition and instance lifecycle.")
@RestController
@RequestMapping("/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;
    private final ComfyUiWorkflowImportService comfyUiWorkflowImportService;

    @Operation(summary = "Create workflow definition",
            description = "Creates a workflow definition from frontend canvas nodes. Node config examples are available from GET /workflow/node/catalog.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow definition created.",
                    content = @Content(schema = @Schema(implementation = WorkflowDefinition.class))),
            @ApiResponse(responseCode = "400", description = "Invalid workflow definition request."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PostMapping("/definitions")
    public Result<WorkflowDefinition> createDefinition(@Valid @RequestBody WorkflowDefinitionDTO request) {
        return Result.success(workflowService.createDefinition(request));
    }

    @Operation(summary = "List workflow definitions",
            description = "Lists non-deleted workflow definitions for dashboard and workflow builder reload.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow definitions returned.",
                    content = @Content(schema = @Schema(implementation = WorkflowDefinition.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/definitions")
    public Result<List<WorkflowDefinition>> listDefinitions() {
        return Result.success(workflowService.listDefinitions());
    }

    @Operation(summary = "Get workflow definition detail",
            description = "Returns one persisted workflow definition including serialized graph JSON.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow definition returned.",
                    content = @Content(schema = @Schema(implementation = WorkflowDefinition.class))),
            @ApiResponse(responseCode = "404", description = "Workflow definition not found."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/definitions/{definitionId}")
    public Result<WorkflowDefinition> getDefinition(@Parameter(description = "Workflow definition id.", example = "1")
                                                    @PathVariable Long definitionId) {
        return Result.success(workflowService.getDefinition(definitionId));
    }

    @Operation(summary = "Update workflow definition",
            description = "Updates a persisted workflow definition from workflow builder graph data.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow definition updated.",
                    content = @Content(schema = @Schema(implementation = WorkflowDefinition.class))),
            @ApiResponse(responseCode = "400", description = "Invalid workflow definition request."),
            @ApiResponse(responseCode = "404", description = "Workflow definition not found."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PutMapping("/definitions/{definitionId}")
    public Result<WorkflowDefinition> updateDefinition(@Parameter(description = "Workflow definition id.", example = "1")
                                                       @PathVariable Long definitionId,
                                                       @Valid @RequestBody WorkflowDefinitionDTO request) {
        return Result.success(workflowService.updateDefinition(definitionId, request));
    }

    @Operation(summary = "Import ComfyUI workflow",
            description = "Converts a ComfyUI workflow.json export into an AetherFlow workflow DAG for review and saving.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Imported workflow DAG returned.",
                    content = @Content(schema = @Schema(implementation = WorkflowDefinitionDTO.class))),
            @ApiResponse(responseCode = "400", description = "Invalid ComfyUI workflow json."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PostMapping("/definitions/import/comfyui")
    public Result<WorkflowDefinitionDTO> importComfyUi(@Valid @RequestBody ComfyUiWorkflowImportRequest request) {
        return Result.success(comfyUiWorkflowImportService.importWorkflow(
                request.getName(),
                request.getDescription(),
                request.getProjectId(),
                request.getWorkflowJson()
        ));
    }

    @Operation(summary = "Delete workflow definition",
            description = "Soft deletes a workflow definition by marking it DELETED.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow definition deleted."),
            @ApiResponse(responseCode = "404", description = "Workflow definition not found."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @DeleteMapping("/definitions/{definitionId}")
    public Result<Void> deleteDefinition(@Parameter(description = "Workflow definition id.", example = "1")
                                         @PathVariable Long definitionId) {
        workflowService.deleteDefinition(definitionId);
        return Result.success();
    }

    @Operation(summary = "Start workflow instance",
            description = "Starts a workflow instance with user id and initial input variables.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow instance started.",
                    content = @Content(schema = @Schema(implementation = WorkflowInstance.class))),
            @ApiResponse(responseCode = "400", description = "Invalid start workflow request."),
            @ApiResponse(responseCode = "404", description = "Workflow definition not found."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PostMapping("/definitions/{definitionId}/instances")
    public Result<WorkflowInstance> startInstance(@Parameter(description = "Workflow definition id.", example = "1")
                                                  @PathVariable Long definitionId,
                                                  @RequestBody StartWorkflowRequest request) {
        return Result.success(workflowService.startInstance(definitionId, request));
    }
}

