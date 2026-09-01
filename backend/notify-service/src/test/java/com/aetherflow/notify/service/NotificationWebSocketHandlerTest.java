package com.aetherflow.notify.service;

// pattern: Imperative Shell

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationWebSocketHandlerTest {

    @Test
    void rejectsSecondConnectionForTheSameUserWhenPerUserCapacityIsReached() throws Exception {
        NotificationWebSocketHandler handler = new NotificationWebSocketHandler(new ObjectMapper());
        ReflectionTestUtils.setField(handler, "maxConnectionsPerUser", 1);
        WebSocketSession first = session("first", 7L);
        WebSocketSession second = session("second", 7L);

        handler.afterConnectionEstablished(first);
        handler.afterConnectionEstablished(second);

        verify(second).close(CloseStatus.SERVICE_OVERLOAD.withReason("user stream capacity reached"));
    }

    private static WebSocketSession session(String id, Long userId) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.getAttributes()).thenReturn(new HashMap<>(java.util.Map.of("userId", userId)));
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
