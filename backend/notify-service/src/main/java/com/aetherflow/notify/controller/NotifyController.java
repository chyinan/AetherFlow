package com.aetherflow.notify.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.notify.dto.NotificationRecordResponse;
import com.aetherflow.notify.dto.StreamTokenResponse;
import com.aetherflow.notify.service.NotificationService;
import com.aetherflow.notify.service.SseEmitterRegistry;
import com.aetherflow.notify.service.StreamTokenService;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@Tag(name = "Notify", description = "Frontend public notification SSE API plus Internal service-to-service send API.")
@RestController
@RequestMapping("/notify")
@RequiredArgsConstructor
public class NotifyController {

    private final SseEmitterRegistry sseEmitterRegistry;
    private final NotificationService notificationService;
    private final StreamTokenService streamTokenService;

    @Operation(summary = "Subscribe notification SSE stream",
            description = "Frontend public Server-Sent Events endpoint for receiving user notification events.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "SSE stream established.",
                    content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE)),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/sse/{userId}")
    public SseEmitter subscribe(@Parameter(description = "Target user id.", example = "10001")
                                @PathVariable Long userId,
                                @RequestParam("streamToken") String streamToken) {
        StreamTokenService.StreamTokenClaims claims = streamTokenService.validate(streamToken);
        if (claims.userId() == null || !claims.userId().equals(userId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "stream token user does not match requested user");
        }
        return sseEmitterRegistry.register(userId);
    }

    @Operation(summary = "Issue short-lived stream token",
            description = "Issues a short-lived token for browser realtime transports that cannot send Authorization headers.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Stream token issued."),
            @ApiResponse(responseCode = "401", description = "Missing authenticated user."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PostMapping("/stream-token")
    public Result<StreamTokenResponse> streamToken(
            @Parameter(description = "Authenticated user id forwarded by Gateway.", example = "10001")
            @RequestHeader("X-User-Id") Long userId,
            @Parameter(description = "Authenticated username forwarded by Gateway.", example = "alice")
            @RequestHeader(value = "X-Username", required = false) String username) {
        return Result.success(streamTokenService.issue(userId, username));
    }

    @Operation(summary = "List user notifications",
            description = "Returns recent notification records for the authenticated user.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Notification records returned."),
            @ApiResponse(responseCode = "401", description = "Missing authenticated user."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/messages")
    public Result<List<NotificationRecordResponse>> listMessages(
            @Parameter(description = "Authenticated user id forwarded by Gateway.", example = "10001")
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(notificationService.list(userId, limit));
    }

    @Operation(summary = "Mark all user notifications as read")
    @PostMapping("/messages/read-all")
    public Result<Void> markAllRead(
            @Parameter(description = "Authenticated user id forwarded by Gateway.", example = "10001")
            @RequestHeader("X-User-Id") Long userId) {
        notificationService.markAllRead(userId);
        return Result.success();
    }

    @Operation(summary = "Clear user notifications")
    @DeleteMapping("/messages")
    public Result<Void> clearMessages(
            @Parameter(description = "Authenticated user id forwarded by Gateway.", example = "10001")
            @RequestHeader("X-User-Id") Long userId) {
        notificationService.clear(userId);
        return Result.success();
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

