package com.aetherflow.workflow.runtime.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.metrics.RuntimeMetricsSnapshot;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import com.aetherflow.workflow.runtime.observability.WorkflowRuntimeObservation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/workflow/runtime")
@RequiredArgsConstructor
public class WorkflowRuntimeController {

    private final WorkflowRuntimeMetrics metrics;
    private final InMemoryRuntimeObservationStore observationStore;

    @GetMapping("/metrics")
    public Result<RuntimeMetricsSnapshot> metrics() {
        return Result.success(metrics.snapshot());
    }

    @GetMapping("/observability/{workflowId}")
    public Result<WorkflowRuntimeObservation> observability(@PathVariable String workflowId) {
        return Result.success(observationStore.snapshot(workflowId).orElse(null));
    }

    @GetMapping("/events/{workflowId}")
    public Result<List<RuntimeEvent>> events(@PathVariable String workflowId) {
        return Result.success(observationStore.events(workflowId));
    }
}
