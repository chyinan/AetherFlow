package com.aetherflow.notify.service;

// pattern: Imperative Shell

import com.aetherflow.common.dto.NotifyMessageDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@ConditionalOnProperty(name = "aetherflow.notify.redis-fanout-enabled", havingValue = "true")
public class RedisNotificationFanout implements MessageListener {

    public static final String CHANNEL = "aetherflow:notify:fanout:v1";

    private final StringRedisTemplate redisTemplate;
    private final RedisConnectionFactory connectionFactory;
    private final ObjectMapper objectMapper;
    private final NotificationWebSocketHandler webSocketHandler;
    private final SseEmitterRegistry sseEmitterRegistry;
    private RedisMessageListenerContainer container;

    public RedisNotificationFanout(StringRedisTemplate redisTemplate,
                                   RedisConnectionFactory connectionFactory,
                                   ObjectMapper objectMapper,
                                   NotificationWebSocketHandler webSocketHandler,
                                   SseEmitterRegistry sseEmitterRegistry) {
        this.redisTemplate = redisTemplate;
        this.connectionFactory = connectionFactory;
        this.objectMapper = objectMapper;
        this.webSocketHandler = webSocketHandler;
        this.sseEmitterRegistry = sseEmitterRegistry;
    }

    @PostConstruct
    void start() {
        container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(this, new ChannelTopic(CHANNEL));
        container.start();
    }

    public boolean publish(NotifyMessageDTO message) {
        try {
            redisTemplate.convertAndSend(CHANNEL, objectMapper.writeValueAsString(message));
            return true;
        } catch (Exception exception) {
            log.warn("Redis notification fanout failed; caller may use local fallback", exception);
            return false;
        }
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            NotifyMessageDTO notification = objectMapper.readValue(message.getBody(), NotifyMessageDTO.class);
            Long userId = notification.getUserId();
            webSocketHandler.send(userId, notification);
            sseEmitterRegistry.send(userId, notification);
        } catch (Exception exception) {
            log.warn("Redis notification fanout message ignored because payload is invalid", exception);
        }
    }

    @PreDestroy
    void stop() {
        if (container != null) {
            container.stop();
        }
    }
}
