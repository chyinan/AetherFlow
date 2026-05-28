package com.aetherflow.workflow.runtime.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.metrics.RuntimeMetricsSnapshot;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import com.aetherflow.workflow.runtime.observability.RuntimeObservationRebuilder;
import com.aetherflow.workflow.runtime.observability.WorkflowRuntimeObservation;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Workflow Runtime", description = "Frontend public runtime observability APIs for workflow execution monitoring.")
@RestController
@RequestMapping("/workflow/runtime")
public class WorkflowRuntimeController {

    private final WorkflowRuntimeMetrics metrics;
    private final InMemoryRuntimeObservationStore observationStore;
    private final RuntimeEventStore runtimeEventStore;

    public WorkflowRuntimeController(WorkflowRuntimeMetrics metrics,
                                     InMemoryRuntimeObservationStore observationStore,
                                     RuntimeEventStore runtimeEventStore) {
        this.metrics = metrics;
        this.observationStore = observationStore;
        this.runtimeEventStore = runtimeEventStore;
    }

    public WorkflowRuntimeController(WorkflowRuntimeMetrics metrics,
                                     InMemoryRuntimeObservationStore observationStore) {
        this(metrics, observationStore, new RuntimeEventStore() {
            @Override
            public void append(RuntimeEvent event) {
            }

            @Override
            public List<RuntimeEvent> findByWorkflowId(String workflowId) {
                return observationStore.events(workflowId);
            }
        });
    }

    @Operation(summary = "Get workflow runtime metrics",
            description = "Returns in-memory runtime counters for frontend monitoring dashboards.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Runtime metrics returned.",
                    content = @Content(schema = @Schema(implementation = RuntimeMetricsSnapshot.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/metrics")
    public Result<RuntimeMetricsSnapshot> metrics() {
        return Result.success(metrics.snapshot());
    }

    @Operation(summary = "Get workflow runtime observation",
            description = "Returns current runtime observation for a workflow id. If memory state is missing, the controller rebuilds from persisted runtime events when available.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Runtime observation returned. Data can be null when workflow id has no events.",
                    content = @Content(schema = @Schema(implementation = WorkflowRuntimeObservation.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/observability/{workflowId}")
    public Result<WorkflowRuntimeObservation> observability(@Parameter(description = "Workflow instance id.", example = "workflow-1001")
                                                            @PathVariable String workflowId) {
        WorkflowRuntimeObservation observation = observationStore.snapshot(workflowId)
                .orElseGet(() -> RuntimeObservationRebuilder.rebuild(workflowId, runtimeEventStore.safeEvents(workflowId))
                        .orElse(null));
        return Result.success(observation);
    }

    @Operation(summary = "List workflow runtime events",
            description = "Returns persisted runtime events for workflow replay and frontend timeline rendering.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Runtime events returned.",
                    content = @Content(array = @ArraySchema(schema = @Schema(implementation = RuntimeEvent.class)))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/events/{workflowId}")
    public Result<List<RuntimeEvent>> events(@Parameter(description = "Workflow instance id.", example = "workflow-1001")
                                             @PathVariable String workflowId) {
        return Result.success(runtimeEventStore.safeEvents(workflowId));
    }
}
