package com.aetherflow.ai.client;

import com.aetherflow.common.core.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

@FeignClient(name = "task-service", path = "/internal/tasks")
public interface TaskStatusClient {

    @PostMapping("/{taskId}/succeeded")
    Result<Void> markSucceeded(@PathVariable("taskId") Long taskId);
}
