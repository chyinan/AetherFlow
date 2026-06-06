package com.aetherflow.notify.service.impl;

import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.notify.entity.NotificationRecord;
import com.aetherflow.notify.mapper.NotificationRecordMapper;
import com.aetherflow.notify.service.NotificationWebSocketHandler;
import com.aetherflow.notify.service.SseEmitterRegistry;
import com.aetherflow.notify.service.TelegramNotificationSender;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationServiceImplTest {

    @Test
    void duplicateEventIdInsertRaceDoesNotSendDuplicateNotification() {
        NotificationRecordMapper notificationRecordMapper = mock(NotificationRecordMapper.class);
        NotificationWebSocketHandler webSocketHandler = mock(NotificationWebSocketHandler.class);
        SseEmitterRegistry sseEmitterRegistry = mock(SseEmitterRegistry.class);
        TelegramNotificationSender telegramNotificationSender = mock(TelegramNotificationSender.class);
        when(notificationRecordMapper.selectCount(any())).thenReturn(0L);
        doAnswer(invocation -> {
            throw new DuplicateKeyException("duplicate event id");
        }).when(notificationRecordMapper).insert(any(NotificationRecord.class));
        NotificationServiceImpl service = new NotificationServiceImpl(
                notificationRecordMapper,
                webSocketHandler,
                sseEmitterRegistry,
                telegramNotificationSender,
                new ObjectMapper()
        );
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(7L);
        message.setEventId("ai-task:59:node-1:AI_TASK_SUCCEEDED");
        message.setChannel("AI_TASK");
        message.setEventType("AI_TASK_SUCCEEDED");
        message.setPayload(Map.of("taskId", 59L));

        service.send(message);

        verify(webSocketHandler, never()).send(any(), any());
        verify(sseEmitterRegistry, never()).send(any(), any());
        verify(telegramNotificationSender, never()).sendIfRequested(any());
    }

    @Test
    void sendsTelegramWhenNotificationRequestsTelegramMethod() {
        NotificationRecordMapper notificationRecordMapper = mock(NotificationRecordMapper.class);
        NotificationWebSocketHandler webSocketHandler = mock(NotificationWebSocketHandler.class);
        SseEmitterRegistry sseEmitterRegistry = mock(SseEmitterRegistry.class);
        TelegramNotificationSender telegramNotificationSender = mock(TelegramNotificationSender.class);
        when(notificationRecordMapper.selectCount(any())).thenReturn(0L);
        NotificationServiceImpl service = new NotificationServiceImpl(
                notificationRecordMapper,
                webSocketHandler,
                sseEmitterRegistry,
                telegramNotificationSender,
                new ObjectMapper()
        );
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(7L);
        message.setEventId("human:approval:1");
        message.setChannel("WORKFLOW");
        message.setEventType("HUMAN_APPROVAL_REQUESTED");
        message.setPayload(Map.of("methods", "webapp,telegram", "title", "Approval required"));

        service.send(message);

        verify(webSocketHandler).send(7L, message);
        verify(sseEmitterRegistry).send(7L, message);
        verify(telegramNotificationSender).sendIfRequested(message);
    }
}
