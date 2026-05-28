package com.aetherflow.workflow.node.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetricsSnapshot;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/workflow/node")
@RequiredArgsConstructor
public class WorkflowNodeMetricsController {

    private final WorkflowNodeMetrics metrics;

    @GetMapping("/metrics")
    public Result<WorkflowNodeMetricsSnapshot> metrics() {
        return Result.success(metrics.snapshot());
    }
}
