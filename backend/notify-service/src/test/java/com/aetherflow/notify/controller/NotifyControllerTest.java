package com.aetherflow.notify.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.InternalServiceTokenService;
import com.aetherflow.notify.dto.StreamTokenResponse;
import com.aetherflow.notify.config.NotifyInternalProperties;
import com.aetherflow.notify.service.NotificationService;
import com.aetherflow.notify.service.SseEmitterRegistry;
import com.aetherflow.notify.service.StreamTokenService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotifyControllerTest {

    @Test
    void issuesStreamTokenForGatewayAuthenticatedUser() {
        SseEmitterRegistry registry = mock(SseEmitterRegistry.class);
        NotificationService notificationService = mock(NotificationService.class);
        StreamTokenService streamTokenService = mock(StreamTokenService.class);
        NotifyController controller = new NotifyController(registry, notificationService, streamTokenService, properties());
        StreamTokenResponse response = new StreamTokenResponse(
                "stream-token",
                "stream",
                7L,
                Instant.parse("2026-05-29T10:21:00Z"),
                60,
                List.of("notify-websocket"),
                "streamToken"
        );
        when(streamTokenService.issue(7L, "alice")).thenReturn(response);

        Result<StreamTokenResponse> result = controller.streamToken(7L, "alice");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().token()).isEqualTo("stream-token");
        assertThat(result.getData().queryParam()).isEqualTo("streamToken");
        verify(streamTokenService).issue(7L, "alice");
    }

    @Test
    void rejectsSseSubscriptionWhenStreamTokenBelongsToAnotherUser() {
        SseEmitterRegistry registry = mock(SseEmitterRegistry.class);
        NotificationService notificationService = mock(NotificationService.class);
        StreamTokenService streamTokenService = mock(StreamTokenService.class);
        NotifyController controller = new NotifyController(registry, notificationService, streamTokenService, properties());
        when(streamTokenService.validate("stream-token"))
                .thenReturn(new StreamTokenService.StreamTokenClaims(8L, "bob"));

        assertThatThrownBy(() -> controller.subscribe(7L, "stream-token", null))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
    }

    @Test
    void registersSseSubscriptionWhenStreamTokenUserMatchesPathUser() {
        SseEmitterRegistry registry = mock(SseEmitterRegistry.class);
        NotificationService notificationService = mock(NotificationService.class);
        StreamTokenService streamTokenService = mock(StreamTokenService.class);
        NotifyController controller = new NotifyController(registry, notificationService, streamTokenService, properties());
        when(streamTokenService.validate("stream-token"))
                .thenReturn(new StreamTokenService.StreamTokenClaims(7L, "alice"));

        controller.subscribe(7L, "stream-token", null);

        verify(registry).register(7L);
    }

    @Test
    void requiresInternalTokenForNotificationSend() {
        SseEmitterRegistry registry = mock(SseEmitterRegistry.class);
        NotificationService notificationService = mock(NotificationService.class);
        StreamTokenService streamTokenService = mock(StreamTokenService.class);
        NotifyInternalProperties properties = new NotifyInternalProperties();
        properties.setInternalToken("0123456789abcdef0123456789abcdef");
        NotifyController controller = new NotifyController(registry, notificationService, streamTokenService, properties);

        assertThatThrownBy(() -> controller.send(null, new com.aetherflow.common.dto.NotifyMessageDTO()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ResultCode.FORBIDDEN);

        String token = new InternalServiceTokenService(properties.getInternalToken(), "aetherflow-internal", Duration.ofMinutes(1))
                .issue("notify-service", Instant.now());
        com.aetherflow.common.dto.NotifyMessageDTO message = new com.aetherflow.common.dto.NotifyMessageDTO();
        message.setUserId(7L);
        controller.send(token, message);
        verify(notificationService).send(org.mockito.ArgumentMatchers.any());
    }

    private static NotifyInternalProperties properties() {
        NotifyInternalProperties properties = new NotifyInternalProperties();
        properties.setInternalToken("0123456789abcdef0123456789abcdef");
        return properties;
    }
}
