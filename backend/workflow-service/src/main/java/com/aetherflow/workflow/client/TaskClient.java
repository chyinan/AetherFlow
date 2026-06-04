package com.aetherflow.workflow.client;

import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "task-service", path = "/internal/tasks")
public interface TaskClient {

    @PostMapping("/dispatch")
    Result<Long> dispatch(
            @RequestHeader(InternalHeaders.TASK_SERVICE_TOKEN) String internalToken,
            @RequestBody TaskMessageDTO taskMessage);
}

