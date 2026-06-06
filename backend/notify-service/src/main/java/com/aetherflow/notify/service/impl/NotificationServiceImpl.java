package com.aetherflow.notify.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.notify.dto.NotificationRecordResponse;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.notify.entity.NotificationRecord;
import com.aetherflow.notify.mapper.NotificationRecordMapper;
import com.aetherflow.notify.service.NotificationService;
import com.aetherflow.notify.service.NotificationWebSocketHandler;
import com.aetherflow.notify.service.SseEmitterRegistry;
import com.aetherflow.notify.service.TelegramNotificationSender;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {

    private static final TypeReference<Map<String, Object>> PAYLOAD_TYPE = new TypeReference<>() {
    };

    private final NotificationRecordMapper notificationRecordMapper;
    private final NotificationWebSocketHandler webSocketHandler;
    private final SseEmitterRegistry sseEmitterRegistry;
    private final TelegramNotificationSender telegramNotificationSender;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void send(NotifyMessageDTO message) {
        if (StringUtils.hasText(message.getEventId()) && existsEvent(message.getEventId())) {
            return;
        }
        NotificationRecord record = new NotificationRecord();
        record.setUserId(message.getUserId());
        record.setEventId(message.getEventId());
        record.setChannel(message.getChannel());
        record.setEventType(message.getEventType());
        record.setPayloadJson(writeJson(message.getPayload()));
        record.setStatus("SENT");
        record.setCreatedAt(LocalDateTime.now());
        try {
            notificationRecordMapper.insert(record);
        } catch (DuplicateKeyException exception) {
            if (StringUtils.hasText(message.getEventId())) {
                return;
            }
            throw exception;
        }

        webSocketHandler.send(message.getUserId(), message);
        sseEmitterRegistry.send(message.getUserId(), message);
        telegramNotificationSender.sendIfRequested(message);
    }

    private boolean existsEvent(String eventId) {
        Long count = notificationRecordMapper.selectCount(new LambdaQueryWrapper<NotificationRecord>()
                .eq(NotificationRecord::getEventId, eventId));
        return count != null && count > 0;
    }

    @Override
    public List<NotificationRecordResponse> list(Long userId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 50));
        return notificationRecordMapper.selectList(new LambdaQueryWrapper<NotificationRecord>()
                        .eq(NotificationRecord::getUserId, userId)
                        .orderByDesc(NotificationRecord::getCreatedAt)
                        .orderByDesc(NotificationRecord::getId)
                        .last("LIMIT " + safeLimit))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markAllRead(Long userId) {
        notificationRecordMapper.update(null, new LambdaUpdateWrapper<NotificationRecord>()
                .eq(NotificationRecord::getUserId, userId)
                .ne(NotificationRecord::getStatus, "READ")
                .set(NotificationRecord::getStatus, "READ"));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void clear(Long userId) {
        notificationRecordMapper.delete(new LambdaQueryWrapper<NotificationRecord>()
                .eq(NotificationRecord::getUserId, userId));
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "notification payload json serialization failed");
        }
    }

    private NotificationRecordResponse toResponse(NotificationRecord record) {
        return new NotificationRecordResponse(
                record.getId(),
                record.getUserId(),
                record.getChannel(),
                record.getEventType(),
                readPayload(record.getPayloadJson()),
                record.getStatus(),
                record.getCreatedAt()
        );
    }

    private Map<String, Object> readPayload(String value) {
        if (value == null || value.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(value, PAYLOAD_TYPE);
        } catch (JsonProcessingException exception) {
            return Map.of();
        }
    }
}

