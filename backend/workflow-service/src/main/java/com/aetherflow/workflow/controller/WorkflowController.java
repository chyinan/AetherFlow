package com.aetherflow.workflow.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Workflow", description = "Frontend public APIs for workflow definition and instance lifecycle.")
@RestController
@RequestMapping("/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;

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

