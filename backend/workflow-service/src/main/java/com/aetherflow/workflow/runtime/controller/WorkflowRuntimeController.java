package com.aetherflow.workflow.runtime.controller;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.metrics.RuntimeMetricsSnapshot;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import com.aetherflow.workflow.runtime.observability.RuntimeObservationRebuilder;
import com.aetherflow.workflow.runtime.observability.WorkflowRuntimeObservation;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.runtime.stream.RuntimeEventStreamService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@Tag(name = "Workflow Runtime", description = "Frontend public runtime observability APIs for workflow execution monitoring.")
@RestController
@RequestMapping("/workflow/runtime")
public class WorkflowRuntimeController {

    private final WorkflowRuntimeMetrics metrics;
    private final InMemoryRuntimeObservationStore observationStore;
    private final RuntimeEventStore runtimeEventStore;
    private final RuntimeEventStreamService streamService;
    private final WorkflowInstanceMapper workflowInstanceMapper;

    @Autowired
    public WorkflowRuntimeController(WorkflowRuntimeMetrics metrics,
                                     InMemoryRuntimeObservationStore observationStore,
                                     RuntimeEventStore runtimeEventStore,
                                     RuntimeEventStreamService streamService,
                                     WorkflowInstanceMapper workflowInstanceMapper) {
        this.metrics = metrics;
        this.observationStore = observationStore;
        this.runtimeEventStore = runtimeEventStore;
        this.streamService = streamService;
        this.workflowInstanceMapper = workflowInstanceMapper;
    }

    public WorkflowRuntimeController(WorkflowRuntimeMetrics metrics,
                                     InMemoryRuntimeObservationStore observationStore,
                                     RuntimeEventStore runtimeEventStore,
                                     RuntimeEventStreamService streamService) {
        this(metrics, observationStore, runtimeEventStore, streamService, null);
    }

    public WorkflowRuntimeController(WorkflowRuntimeMetrics metrics,
                                     InMemoryRuntimeObservationStore observationStore,
                                     RuntimeEventStore runtimeEventStore) {
        this(metrics, observationStore, runtimeEventStore, new RuntimeEventStreamService(runtimeEventStore));
    }

    public WorkflowRuntimeController(WorkflowRuntimeMetrics metrics,
                                     InMemoryRuntimeObservationStore observationStore,
                                     RuntimeEventStore runtimeEventStore,
                                     WorkflowInstanceMapper workflowInstanceMapper) {
        this(metrics, observationStore, runtimeEventStore, new RuntimeEventStreamService(runtimeEventStore), workflowInstanceMapper);
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
                                                            @PathVariable String workflowId,
                                                            @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        assertWorkflowOwner(workflowId, userId);
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
                                             @PathVariable String workflowId,
                                             @RequestHeader(value = "X-User-Id", required = false) Long userId) {
        assertWorkflowOwner(workflowId, userId);
        return Result.success(runtimeEventStore.safeEvents(workflowId));
    }

    @Operation(summary = "Stream workflow runtime events",
            description = "Streams RuntimeEvent frames as Server-Sent Events. The stream supports heartbeat and recovery via Last-Event-ID or cursor.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Runtime event stream opened.",
                    content = @Content(array = @ArraySchema(schema = @Schema(implementation = RuntimeEvent.class)))),
            @ApiResponse(responseCode = "400", description = "Invalid workflow id."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping(value = "/stream/{workflowId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Parameter(description = "Workflow instance id.", example = "workflow-1001")
                             @PathVariable String workflowId,
                             @RequestHeader(value = "X-User-Id", required = false) Long userId,
                             @Parameter(description = "Last SSE event id observed by the client.", example = "event-1")
                             @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
                             @Parameter(description = "Explicit event cursor. Takes precedence over Last-Event-ID.", example = "event-1")
                             @RequestParam(required = false) String cursor) {
        assertWorkflowOwner(workflowId, userId);
        return streamService.stream(workflowId, lastEventId, cursor);
    }

    private void assertWorkflowOwner(String workflowId, Long userId) {
        if (workflowInstanceMapper == null) {
            return;
        }
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "authenticated user is required");
        }
        Long instanceId;
        try {
            instanceId = Long.valueOf(workflowId);
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflow id is invalid");
        }
        WorkflowInstance instance = workflowInstanceMapper.selectById(instanceId);
        if (instance == null || instance.getUserId() == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "workflow instance not found");
        }
        if (!instance.getUserId().equals(userId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "workflow instance forbidden");
        }
    }
}
