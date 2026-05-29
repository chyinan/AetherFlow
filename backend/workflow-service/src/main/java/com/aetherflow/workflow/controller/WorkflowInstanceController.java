package com.aetherflow.workflow.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.LogFrame;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunPageResponse;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunView;
import com.aetherflow.workflow.service.WorkflowInstanceQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Workflow Instances", description = "Frontend public APIs for workflow run query and runtime logs.")
@RestController
@RequestMapping("/workflow-instances")
@RequiredArgsConstructor
public class WorkflowInstanceController {

    private final WorkflowInstanceQueryService queryService;

    @Operation(summary = "List workflow runs",
            description = "Lists persisted workflow runs with runtime trace and node summaries.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow runs returned.",
                    content = @Content(schema = @Schema(implementation = RunPageResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid run query."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping
    public Result<RunPageResponse> listInstances(
            @Parameter(description = "Frontend workflow id or runtime workflow id.", example = "1")
            @RequestParam(required = false) String workflowId,
            @Parameter(description = "Workflow run status.", example = "SUCCESS")
            @RequestParam(required = false) String status,
            @Parameter(description = "Page number, starting from 1.", example = "1")
            @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "Page size.", example = "20")
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(queryService.listInstances(workflowId, status, page, pageSize));
    }

    @Operation(summary = "Get workflow run detail",
            description = "Returns a persisted workflow run with runtime trace and node summaries.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow run returned.",
                    content = @Content(schema = @Schema(implementation = RunView.class))),
            @ApiResponse(responseCode = "400", description = "Invalid workflow run id."),
            @ApiResponse(responseCode = "404", description = "Workflow run not found."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/{id}")
    public Result<RunView> getInstance(@Parameter(description = "Workflow instance id.", example = "1001")
                                       @PathVariable Long id) {
        return Result.success(queryService.getInstance(id));
    }

    @Operation(summary = "Get workflow run logs",
            description = "Returns runtime event log frames for a persisted workflow run.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow run logs returned.",
                    content = @Content(schema = @Schema(implementation = LogFrame.class))),
            @ApiResponse(responseCode = "400", description = "Invalid workflow run id."),
            @ApiResponse(responseCode = "404", description = "Workflow run not found."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/{id}/logs")
    public Result<List<LogFrame>> logs(@Parameter(description = "Workflow instance id.", example = "1001")
                                       @PathVariable Long id) {
        return Result.success(queryService.logs(id));
    }
}
