package com.aetherflow.workflow.node.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetricsSnapshot;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Workflow Node Metrics", description = "Frontend public workflow node execution metrics APIs.")
@RestController
@RequestMapping("/workflow/node")
@RequiredArgsConstructor
public class WorkflowNodeMetricsController {

    private final WorkflowNodeMetrics metrics;

    @Operation(summary = "Get workflow node metrics",
            description = "Returns node executor counters including execution, retry and failure counts.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow node metrics returned.",
                    content = @Content(schema = @Schema(implementation = WorkflowNodeMetricsSnapshot.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/metrics")
    public Result<WorkflowNodeMetricsSnapshot> metrics() {
        return Result.success(metrics.snapshot());
    }
}
