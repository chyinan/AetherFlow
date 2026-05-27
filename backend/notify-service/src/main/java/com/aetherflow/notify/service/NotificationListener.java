package com.aetherflow.notify.service;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.NotifyMessageDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class NotificationListener {

    private final NotificationService notificationService;

    @RabbitListener(queues = RabbitMqNames.NOTIFY_QUEUE)
    public void onMessage(NotifyMessageDTO message) {
        notificationService.send(message);
    }
}

