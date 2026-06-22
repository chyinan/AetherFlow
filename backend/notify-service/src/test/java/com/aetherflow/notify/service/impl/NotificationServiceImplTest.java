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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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

    @Test
    void sendDefersPushUntilTransactionCommit() {
        // Regression test for the ghost-notification bug: with an active transaction the
        // WebSocket / SSE push MUST NOT happen synchronously inside send(). Instead it is
        // registered via TransactionSynchronizationManager and only fired by Spring's
        // afterCommit hook once STATUS_COMMITTED has been reached. If the surrounding
        // transaction rolls back the synchronizations are discarded, so no notification
        // leaks for a row that was never persisted.
        NotificationRecordMapper notificationRecordMapper = mock(NotificationRecordMapper.class);
        NotificationWebSocketHandler webSocketHandler = mock(NotificationWebSocketHandler.class);
        SseEmitterRegistry sseEmitterRegistry = mock(SseEmitterRegistry.class);
        TelegramNotificationSender telegramNotificationSender = mock(TelegramNotificationSender.class);
        when(notificationRecordMapper.selectCount(any())).thenReturn(0L);
        when(notificationRecordMapper.insert(any(NotificationRecord.class))).thenReturn(1);
        NotificationServiceImpl service = new NotificationServiceImpl(
                notificationRecordMapper,
                webSocketHandler,
                sseEmitterRegistry,
                telegramNotificationSender,
                new ObjectMapper()
        );
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(11L);
        message.setEventId("evt:commit");
        message.setChannel("AI_TASK");
        message.setEventType("AI_TASK_SUCCEEDED");
        message.setPayload(Map.of("taskId", 71L));

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.send(message);

            // While the transaction is still in flight, no push has happened yet.
            verify(webSocketHandler, never()).send(any(), any());
            verify(sseEmitterRegistry, never()).send(any(), any());

            List<TransactionSynchronization> syncs =
                    TransactionSynchronizationManager.getSynchronizations();
            assertThat(syncs).hasSize(1);

            // Spring would only invoke this hook on commit; rolling back skips it entirely.
            syncs.get(0).afterCommit();

            verify(webSocketHandler).send(eq(11L), eq(message));
            verify(sseEmitterRegistry).send(eq(11L), eq(message));
        } finally {
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.clearSynchronization();
            }
        }
    }

    @Test
    void sendPushesEagerlyWhenNoTransactionIsActive() {
        // Outside of any @Transactional scope (e.g. the listener-driven path that does not
        // open a transaction) the afterCommit helper must fall back to eager delivery so
        // notifications do not silently disappear.
        NotificationRecordMapper notificationRecordMapper = mock(NotificationRecordMapper.class);
        NotificationWebSocketHandler webSocketHandler = mock(NotificationWebSocketHandler.class);
        SseEmitterRegistry sseEmitterRegistry = mock(SseEmitterRegistry.class);
        TelegramNotificationSender telegramNotificationSender = mock(TelegramNotificationSender.class);
        when(notificationRecordMapper.selectCount(any())).thenReturn(0L);
        when(notificationRecordMapper.insert(any(NotificationRecord.class))).thenReturn(1);
        NotificationServiceImpl service = new NotificationServiceImpl(
                notificationRecordMapper,
                webSocketHandler,
                sseEmitterRegistry,
                telegramNotificationSender,
                new ObjectMapper()
        );
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(13L);
        message.setEventId("evt:eager");
        message.setChannel("AI_TASK");
        message.setEventType("AI_TASK_SUCCEEDED");
        message.setPayload(Map.of("taskId", 73L));

        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();

        service.send(message);

        verify(webSocketHandler).send(eq(13L), eq(message));
        verify(sseEmitterRegistry).send(eq(13L), eq(message));
    }
}
