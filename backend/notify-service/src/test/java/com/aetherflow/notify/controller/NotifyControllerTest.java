package com.aetherflow.notify.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.notify.dto.StreamTokenResponse;
import com.aetherflow.notify.service.NotificationService;
import com.aetherflow.notify.service.SseEmitterRegistry;
import com.aetherflow.notify.service.StreamTokenService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
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
        NotifyController controller = new NotifyController(registry, notificationService, streamTokenService);
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
        NotifyController controller = new NotifyController(registry, notificationService, streamTokenService);
        when(streamTokenService.validate("stream-token"))
                .thenReturn(new StreamTokenService.StreamTokenClaims(8L, "bob"));

        assertThatThrownBy(() -> controller.subscribe(7L, "stream-token"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
    }

    @Test
    void registersSseSubscriptionWhenStreamTokenUserMatchesPathUser() {
        SseEmitterRegistry registry = mock(SseEmitterRegistry.class);
        NotificationService notificationService = mock(NotificationService.class);
        StreamTokenService streamTokenService = mock(StreamTokenService.class);
        NotifyController controller = new NotifyController(registry, notificationService, streamTokenService);
        when(streamTokenService.validate("stream-token"))
                .thenReturn(new StreamTokenService.StreamTokenClaims(7L, "alice"));

        controller.subscribe(7L, "stream-token");

        verify(registry).register(7L);
    }
}
