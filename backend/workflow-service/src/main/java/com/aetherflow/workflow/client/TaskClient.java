package com.aetherflow.workflow.client;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "task-service", path = "/internal/tasks")
public interface TaskClient {

    @PostMapping("/dispatch")
    Result<Long> dispatch(@RequestBody TaskMessageDTO taskMessage);
}

