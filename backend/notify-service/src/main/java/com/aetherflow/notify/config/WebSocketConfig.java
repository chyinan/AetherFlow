package com.aetherflow.notify.config;

import com.aetherflow.notify.service.NotificationWebSocketHandler;
import com.aetherflow.notify.service.StreamTokenHandshakeInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    /**
     * Comma-separated list of allowed origin patterns for the notification WebSocket.
     * Defaults to {@code *} only for local development convenience. Production should
     * set {@code aetherflow.notify.websocket.allowed-origins=https://app.example.com}
     * via an environment variable to prevent cross-site WebSocket hijacking.
     */
    @Value("${aetherflow.notify.websocket.allowed-origins:*}")
    private String allowedOrigins;

    private final NotificationWebSocketHandler notificationWebSocketHandler;
    private final StreamTokenHandshakeInterceptor streamTokenHandshakeInterceptor;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        String[] origins = java.util.Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
        if (origins.length == 0) {
            origins = new String[]{"*"};
        }
        registry.addHandler(notificationWebSocketHandler, "/notify/ws")
                .addInterceptors(streamTokenHandshakeInterceptor)
                .setAllowedOriginPatterns(origins);
    }
}

