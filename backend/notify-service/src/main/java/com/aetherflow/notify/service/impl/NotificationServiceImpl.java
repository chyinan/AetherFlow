package com.aetherflow.notify.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.notify.entity.NotificationRecord;
import com.aetherflow.notify.mapper.NotificationRecordMapper;
import com.aetherflow.notify.service.NotificationService;
import com.aetherflow.notify.service.NotificationWebSocketHandler;
import com.aetherflow.notify.service.SseEmitterRegistry;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {

    private final NotificationRecordMapper notificationRecordMapper;
    private final NotificationWebSocketHandler webSocketHandler;
    private final SseEmitterRegistry sseEmitterRegistry;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void send(NotifyMessageDTO message) {
        NotificationRecord record = new NotificationRecord();
        record.setUserId(message.getUserId());
        record.setChannel(message.getChannel());
        record.setEventType(message.getEventType());
        record.setPayloadJson(writeJson(message.getPayload()));
        record.setStatus("SENT");
        record.setCreatedAt(LocalDateTime.now());
        notificationRecordMapper.insert(record);

        webSocketHandler.send(message.getUserId(), message);
        sseEmitterRegistry.send(message.getUserId(), message);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "notification payload json serialization failed");
        }
    }
}

