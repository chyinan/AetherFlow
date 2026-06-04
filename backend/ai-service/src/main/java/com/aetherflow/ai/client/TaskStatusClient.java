package com.aetherflow.ai.client;

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "task-service", path = "/internal/tasks")
public interface TaskStatusClient {

    @PostMapping("/{taskId}/succeeded")
    Result<Void> markSucceeded(
            @RequestHeader(InternalHeaders.TASK_SERVICE_TOKEN) String internalToken,
            @PathVariable("taskId") Long taskId);
}
