package com.aetherflow.workflow.runtime.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.metrics.RuntimeMetricsSnapshot;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import com.aetherflow.workflow.runtime.observability.RuntimeObservationRebuilder;
import com.aetherflow.workflow.runtime.observability.WorkflowRuntimeObservation;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

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

    @GetMapping("/metrics")
    public Result<RuntimeMetricsSnapshot> metrics() {
        return Result.success(metrics.snapshot());
    }

    @GetMapping("/observability/{workflowId}")
    public Result<WorkflowRuntimeObservation> observability(@PathVariable String workflowId) {
        WorkflowRuntimeObservation observation = observationStore.snapshot(workflowId)
                .orElseGet(() -> RuntimeObservationRebuilder.rebuild(workflowId, runtimeEventStore.safeEvents(workflowId))
                        .orElse(null));
        return Result.success(observation);
    }

    @GetMapping("/events/{workflowId}")
    public Result<List<RuntimeEvent>> events(@PathVariable String workflowId) {
        return Result.success(runtimeEventStore.safeEvents(workflowId));
    }
}
