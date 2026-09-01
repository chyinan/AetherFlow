package com.aetherflow.ai.client;

// pattern: Imperative Shell

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "task-service", path = "/internal/tasks")
public interface TaskStatusClient {

    @GetMapping("/{taskId}/status")
    Result<String> status(
            @RequestHeader(InternalHeaders.TASK_SERVICE_TOKEN) String internalToken,
            @PathVariable("taskId") Long taskId);

    @PostMapping("/{taskId}/succeeded")
    Result<Void> markSucceeded(
            @RequestHeader(InternalHeaders.TASK_SERVICE_TOKEN) String internalToken,
            @PathVariable("taskId") Long taskId);

    @PostMapping("/{taskId}/failed")
    Result<Void> markFailed(
            @RequestHeader(InternalHeaders.TASK_SERVICE_TOKEN) String internalToken,
            @PathVariable("taskId") Long taskId);
}
