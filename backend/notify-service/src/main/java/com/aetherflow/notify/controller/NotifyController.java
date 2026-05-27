package com.aetherflow.notify.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.notify.service.NotificationService;
import com.aetherflow.notify.service.SseEmitterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/notify")
@RequiredArgsConstructor
public class NotifyController {

    private final SseEmitterRegistry sseEmitterRegistry;
    private final NotificationService notificationService;

    @GetMapping("/sse/{userId}")
    public SseEmitter subscribe(@PathVariable Long userId) {
        return sseEmitterRegistry.register(userId);
    }

    @PostMapping("/internal/send")
    public Result<Void> send(@RequestBody NotifyMessageDTO message) {
        notificationService.send(message);
        return Result.success();
    }
}

