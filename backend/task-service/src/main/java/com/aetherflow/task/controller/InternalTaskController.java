package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.InternalServiceTokenService;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.service.TaskDispatchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;

@RestController
@RequestMapping("/internal/tasks")
@Tag(name = "Internal Task Dispatch", description = "Internal workflow task dispatch APIs.")
public class InternalTaskController {

    private final TaskDispatchService taskDispatchService;
    private final InternalServiceTokenService tokenService;

    public InternalTaskController(TaskDispatchService taskDispatchService, TaskProperties taskProperties) {
        this.taskDispatchService = taskDispatchService;
        this.tokenService = new InternalServiceTokenService(
                taskProperties.getInternalToken(), "aetherflow-internal", Duration.ofMinutes(1));
    }

    @PostMapping("/dispatch")
    @Operation(summary = "Create and dispatch an asynchronous workflow task.")
    public Result<Long> dispatch(
            @RequestHeader(value = InternalHeaders.TASK_SERVICE_TOKEN, required = false) String internalToken,
            @RequestBody TaskMessageDTO taskMessage) {
        validateInternalToken(internalToken);
        return Result.success(taskDispatchService.dispatch(taskMessage));
    }

    @PostMapping("/{id}/succeeded")
    @Operation(summary = "Mark an asynchronous workflow task as succeeded.")
    public Result<Void> markSucceeded(
            @RequestHeader(value = InternalHeaders.TASK_SERVICE_TOKEN, required = false) String internalToken,
            @PathVariable Long id) {
        validateInternalToken(internalToken);
        taskDispatchService.markSucceeded(id);
        return Result.success();
    }

    @PostMapping("/{id}/failed")
    @Operation(summary = "Mark an asynchronous workflow task as failed.")
    public Result<Void> markFailed(
            @RequestHeader(value = InternalHeaders.TASK_SERVICE_TOKEN, required = false) String internalToken,
            @PathVariable Long id) {
        validateInternalToken(internalToken);
        taskDispatchService.markFailed(id);
        return Result.success();
    }

    private void validateInternalToken(String internalToken) {
        if (!tokenService.isValid(internalToken, "task-service", Instant.now())) {
            throw new BusinessException(ResultCode.FORBIDDEN, "invalid internal task token");
        }
    }
}
