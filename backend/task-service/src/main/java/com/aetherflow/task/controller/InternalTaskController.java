package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.task.service.TaskDispatchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/tasks")
@RequiredArgsConstructor
@Tag(name = "Internal Task Dispatch", description = "Internal workflow task dispatch APIs.")
public class InternalTaskController {

    private final TaskDispatchService taskDispatchService;

    @PostMapping("/dispatch")
    @Operation(summary = "Create and dispatch an asynchronous workflow task.")
    public Result<Long> dispatch(@RequestBody TaskMessageDTO taskMessage) {
        return Result.success(taskDispatchService.dispatch(taskMessage));
    }

    @PostMapping("/{id}/succeeded")
    @Operation(summary = "Mark an asynchronous workflow task as succeeded.")
    public Result<Void> markSucceeded(@PathVariable Long id) {
        taskDispatchService.markSucceeded(id);
        return Result.success();
    }
}
