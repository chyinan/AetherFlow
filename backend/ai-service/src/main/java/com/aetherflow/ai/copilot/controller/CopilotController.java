package com.aetherflow.ai.copilot.controller;

// pattern: Imperative Shell

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotCanvasEditResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotWorkflowPlanFailureMetadata;
import com.aetherflow.ai.copilot.service.CopilotService;
import com.aetherflow.ai.copilot.service.CopilotWorkflowPlanFailureException;
import com.aetherflow.common.core.ErrorCode;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Validated
@RestController
@RequestMapping("/copilot")
@RequiredArgsConstructor
@Slf4j
public class CopilotController {

    private final CopilotService copilotService;

    @PostMapping("/canvas-edit")
    public Result<CopilotCanvasEditResponse> editCanvas(@Valid @RequestBody CopilotChatRequest request,
                                                       @RequestHeader("X-User-Id") Long userId) {
        return Result.success(copilotService.editCanvas(userId, request));
    }

    @PostMapping("/chat")
    public Result<CopilotChatResponse> chat(@Valid @RequestBody CopilotChatRequest request,
                                            @RequestHeader("X-User-Id") Long userId) {
        return Result.success(copilotService.chat(userId, request));
    }

    @PostMapping("/workflow-plan")
    public Result<CopilotChatResponse> planWorkflow(@Valid @RequestBody CopilotChatRequest request,
                                                     @RequestHeader("X-User-Id") Long userId) {
        return Result.success(copilotService.planWorkflow(userId, request));
    }

    @ExceptionHandler(CopilotWorkflowPlanFailureException.class)
    public ResponseEntity<Result<?>> handleWorkflowPlanFailure(CopilotWorkflowPlanFailureException exception) {
        if (exception.isUnexpectedFailure()) {
            log.error("Unhandled service exception", exception.getOriginalCause());
        }
        Result<CopilotWorkflowPlanFailureMetadata> result = Result.of(
                exception.getErrorCode().getCode(), exception.getMessage(),
                new CopilotWorkflowPlanFailureMetadata(exception.getConversationId()));
        return ResponseEntity.status(resolveHttpStatus(exception.getErrorCode())).body((Result<?>) result);
    }

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody CopilotChatRequest request,
                             @RequestHeader("X-User-Id") Long userId) {
        SseEmitter emitter = new SseEmitter(65_000L);
        CompletableFuture.runAsync(() -> {
            try {
                CopilotChatResponse response = copilotService.stream(userId, request,
                        metadata -> send(emitter, "conversation", metadata),
                        delta -> send(emitter, "delta", Map.of("content", delta)));
                send(emitter, "complete", response);
                emitter.complete();
            } catch (RuntimeException exception) {
                send(emitter, "error", Map.of("message", exception.getMessage() == null
                        ? "copilot stream failed" : exception.getMessage()));
                emitter.completeWithError(exception);
            }
        });
        return emitter;
    }

    private void send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(data));
        } catch (Exception exception) {
            throw new IllegalStateException("copilot stream delivery failed", exception);
        }
    }

    private HttpStatus resolveHttpStatus(ErrorCode errorCode) {
        int code = errorCode.getCode();
        if (code == ResultCode.UNAUTHORIZED.getCode()) {
            return HttpStatus.UNAUTHORIZED;
        }
        if (code == ResultCode.FORBIDDEN.getCode()) {
            return HttpStatus.FORBIDDEN;
        }
        if (code == ResultCode.NOT_FOUND.getCode()) {
            return HttpStatus.NOT_FOUND;
        }
        if (code == ResultCode.CONFLICT.getCode()) {
            return HttpStatus.CONFLICT;
        }
        if (code == ResultCode.TOO_MANY_REQUESTS.getCode()) {
            return HttpStatus.TOO_MANY_REQUESTS;
        }
        if (code == ResultCode.SERVICE_UNAVAILABLE.getCode()) {
            return HttpStatus.SERVICE_UNAVAILABLE;
        }
        if (code >= 40000 && code < 50000 || code == ResultCode.BAD_REQUEST.getCode()) {
            return HttpStatus.BAD_REQUEST;
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    @GetMapping("/conversations")
    public Result<List<CopilotConversationSummary>> listConversations(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(copilotService.listConversations(userId, limit));
    }

    @GetMapping("/conversations/{id}/messages")
    public Result<List<CopilotMessageResponse>> listMessages(@PathVariable Long id,
                                                             @RequestHeader("X-User-Id") Long userId) {
        return Result.success(copilotService.listMessages(userId, id));
    }
}
