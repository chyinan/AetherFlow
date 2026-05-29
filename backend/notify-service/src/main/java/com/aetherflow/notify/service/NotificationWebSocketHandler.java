package com.aetherflow.notify.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
@RequiredArgsConstructor
public class NotificationWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final Map<Long, List<WebSocketSession>> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Object userIdValue = session.getAttributes().get("userId");
        if (!(userIdValue instanceof Long userId)) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("missing stream token"));
            return;
        }
        sessions.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>()).add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Long userId = (Long) session.getAttributes().get("userId");
        List<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions != null) {
            userSessions.remove(session);
        }
    }

    public void send(Long userId, Object payload) {
        if (userId == null) {
            sessions.values().forEach(list -> list.forEach(session -> sendOne(session, payload)));
            return;
        }
        sessions.getOrDefault(userId, List.of()).forEach(session -> sendOne(session, payload));
    }

    private void sendOne(WebSocketSession session, Object payload) {
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
            }
        } catch (Exception exception) {
            try {
                session.close(CloseStatus.SERVER_ERROR);
            } catch (Exception ignored) {
                // Session is already closing.
            }
        }
    }

}

