package com.aetherflow.common.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
public class NotifyMessageDTO {

    private Long userId;
    private String channel;
    private String eventType;
    private Map<String, Object> payload;
    private OffsetDateTime occurredAt;
}

