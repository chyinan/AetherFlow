package com.aetherflow.workflow.runtime.stream;

// pattern: Imperative Shell
import com.aetherflow.common.security.JwtProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.Arrays;

@Configuration
@EnableWebSocket
@EnableConfigurationProperties({JwtProperties.class, WorkflowRuntimeWebSocketProperties.class})
public class WorkflowRuntimeWebSocketConfig implements WebSocketConfigurer {

    private final RuntimeEventWebSocketHandler handler;
    private final WorkflowRuntimeStreamHandshakeInterceptor handshakeInterceptor;
    private final WorkflowRuntimeWebSocketProperties properties;

    public WorkflowRuntimeWebSocketConfig(RuntimeEventWebSocketHandler handler,
                                          WorkflowRuntimeStreamHandshakeInterceptor handshakeInterceptor,
                                          WorkflowRuntimeWebSocketProperties properties) {
        this.handler = handler;
        this.handshakeInterceptor = handshakeInterceptor;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        String[] origins = Arrays.stream(properties.getAllowedOrigins().split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toArray(String[]::new);
        registry.addHandler(handler, "/workflow/runtime/ws/*")
                .addInterceptors(handshakeInterceptor)
                .setAllowedOriginPatterns(origins);
    }
}
