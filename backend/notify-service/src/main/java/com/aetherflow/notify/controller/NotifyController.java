package com.aetherflow.notify.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.notify.service.NotificationService;
import com.aetherflow.notify.service.SseEmitterRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Tag(name = "Notify", description = "Frontend public notification SSE API plus Internal service-to-service send API.")
@RestController
@RequestMapping("/notify")
@RequiredArgsConstructor
public class NotifyController {

    private final SseEmitterRegistry sseEmitterRegistry;
    private final NotificationService notificationService;

    @Operation(summary = "Subscribe notification SSE stream",
            description = "Frontend public Server-Sent Events endpoint for receiving user notification events.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "SSE stream established.",
                    content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE)),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/sse/{userId}")
    public SseEmitter subscribe(@Parameter(description = "Target user id.", example = "10001")
                                @PathVariable Long userId) {
        return sseEmitterRegistry.register(userId);
    }

    @Operation(summary = "Send notification internally",
            description = "Internal service-to-service endpoint used by workflow-service and MQ consumers. Frontend clients should not call this endpoint directly.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Notification accepted."),
            @ApiResponse(responseCode = "400", description = "Invalid notification message."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PostMapping("/internal/send")
    public Result<Void> send(@RequestBody NotifyMessageDTO message) {
        notificationService.send(message);
        return Result.success();
    }
}

