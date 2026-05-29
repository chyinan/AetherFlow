package com.aetherflow.notify.config;

import com.aetherflow.notify.service.NotificationWebSocketHandler;
import com.aetherflow.notify.service.StreamTokenHandshakeInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final NotificationWebSocketHandler notificationWebSocketHandler;
    private final StreamTokenHandshakeInterceptor streamTokenHandshakeInterceptor;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(notificationWebSocketHandler, "/notify/ws")
                .addInterceptors(streamTokenHandshakeInterceptor)
                .setAllowedOrigins("*");
    }
}

