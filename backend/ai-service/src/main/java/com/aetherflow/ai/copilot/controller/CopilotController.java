package com.aetherflow.ai.copilot.controller;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;
import com.aetherflow.ai.copilot.service.CopilotService;
import com.aetherflow.common.core.Result;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
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
public class CopilotController {

    private final CopilotService copilotService;

    @PostMapping("/chat")
    public Result<CopilotChatResponse> chat(@Valid @RequestBody CopilotChatRequest request,
                                            @RequestHeader("X-User-Id") Long userId) {
        return Result.success(copilotService.chat(userId, request));
    }

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody CopilotChatRequest request,
                             @RequestHeader("X-User-Id") Long userId) {
        SseEmitter emitter = new SseEmitter(65_000L);
        CompletableFuture.runAsync(() -> {
            try {
                CopilotChatResponse response = copilotService.stream(userId, request, delta -> send(emitter,
                        "delta", Map.of("content", delta)));
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
