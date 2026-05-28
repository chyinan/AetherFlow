package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.task.monitor.QueueHealthSnapshot;
import com.aetherflow.task.monitor.QueueMonitorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/task")
@RequiredArgsConstructor
@Tag(name = "Task Metrics", description = "Task-service queue backpressure and MQ metrics APIs.")
public class TaskMetricsController {

    private final QueueMonitorService queueMonitorService;

    @GetMapping("/metrics")
    @Operation(summary = "Get task-service MQ backpressure metrics.")
    public Result<QueueHealthSnapshot> metrics() {
        return Result.success(queueMonitorService.currentSnapshot());
    }
}
