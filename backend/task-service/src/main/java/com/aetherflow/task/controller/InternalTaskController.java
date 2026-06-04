package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.service.TaskDispatchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/internal/tasks")
@RequiredArgsConstructor
@Tag(name = "Internal Task Dispatch", description = "Internal workflow task dispatch APIs.")
public class InternalTaskController {

    private final TaskDispatchService taskDispatchService;
    private final TaskProperties taskProperties;

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

    private void validateInternalToken(String internalToken) {
        String expectedToken = taskProperties.getInternalToken();
        if (!StringUtils.hasText(internalToken) || !StringUtils.hasText(expectedToken)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "invalid internal task token");
        }
        byte[] actual = internalToken.getBytes(StandardCharsets.UTF_8);
        byte[] expected = expectedToken.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(actual, expected)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "invalid internal task token");
        }
    }
}
