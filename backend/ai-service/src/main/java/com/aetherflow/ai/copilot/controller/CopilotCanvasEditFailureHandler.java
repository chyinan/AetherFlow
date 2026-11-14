package com.aetherflow.ai.copilot.controller;

import com.aetherflow.ai.copilot.service.CopilotCanvasEditFailureException;
import com.aetherflow.common.core.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = CopilotController.class)
public class CopilotCanvasEditFailureHandler {

    @ExceptionHandler(CopilotCanvasEditFailureException.class)
    public ResponseEntity<Result<CopilotCanvasEditFailureException.FailureMetadata>> handleCanvasEditFailure(
            CopilotCanvasEditFailureException exception) {
        if (exception.isUnexpectedFailure()) {
            log.error("Unhandled canvas-edit service exception", exception.getOriginalCause());
        }
        Result<CopilotCanvasEditFailureException.FailureMetadata> result = Result.of(
                exception.getErrorCode().getCode(), exception.getMessage(), exception.getFailureMetadata());
        return ResponseEntity.status(exception.getHttpStatus()).body(result);
    }
}
