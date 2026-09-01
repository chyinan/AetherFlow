package com.aetherflow.notify.service;

// pattern: Imperative Shell

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import jakarta.annotation.PreDestroy;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@RequiredArgsConstructor
public class NotificationWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final Map<Long, List<WebSocketSession>> sessions = new ConcurrentHashMap<>();
    private final AtomicInteger connectionCount = new AtomicInteger();

    @Value("${aetherflow.notify.websocket.max-connections:2000}")
    private int maxConnections = 2000;

    @Value("${aetherflow.notify.websocket.max-connections-per-user:10}")
    private int maxConnectionsPerUser = 10;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Object userIdValue = session.getAttributes().get("userId");
        if (!(userIdValue instanceof Long userId)) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("missing stream token"));
            return;
        }
        synchronized (sessions) {
            List<WebSocketSession> userSessions = sessions.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>());
            if (userSessions.size() >= Math.max(1, maxConnectionsPerUser)) {
                session.close(CloseStatus.SERVICE_OVERLOAD.withReason("user stream capacity reached"));
                return;
            }
            int current;
            do {
                current = connectionCount.get();
                if (current >= Math.max(1, maxConnections)
                        || !connectionCount.compareAndSet(current, current + 1)) {
                    if (current >= Math.max(1, maxConnections)) {
                        sessions.remove(userId, userSessions);
                        session.close(CloseStatus.SERVICE_OVERLOAD.withReason("stream capacity reached"));
                        return;
                    }
                    continue;
                }
                break;
            } while (true);
            userSessions.add(session);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Long userId = (Long) session.getAttributes().get("userId");
        List<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions != null) {
            if (userSessions.remove(session)) {
                connectionCount.decrementAndGet();
            }
            if (userSessions.isEmpty()) {
                sessions.remove(userId, userSessions);
            }
        }
    }

    public void send(Long userId, Object payload) {
        if (userId == null || userId <= 0) {
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

    @PreDestroy
    void shutdown() {
        sessions.values().stream()
                .flatMap(List::stream)
                .forEach(session -> {
                    try {
                        if (session.isOpen()) {
                            session.close(CloseStatus.GOING_AWAY);
                        }
                    } catch (Exception ignored) {
                        // The application is already shutting down.
                    }
                });
        sessions.clear();
        connectionCount.set(0);
    }

}

