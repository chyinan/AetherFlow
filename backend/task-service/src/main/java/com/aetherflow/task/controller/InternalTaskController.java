package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.task.service.TaskDispatchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/tasks")
@RequiredArgsConstructor
public class InternalTaskController {

    private final TaskDispatchService taskDispatchService;

    @PostMapping("/dispatch")
    public Result<Long> dispatch(@RequestBody TaskMessageDTO taskMessage) {
        return Result.success(taskDispatchService.dispatch(taskMessage));
    }
}

