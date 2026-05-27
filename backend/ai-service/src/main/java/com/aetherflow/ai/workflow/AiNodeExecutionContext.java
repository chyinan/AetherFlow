package com.aetherflow.ai.workflow;

import com.aetherflow.common.dto.TaskMessageDTO;

import java.util.Map;

public record AiNodeExecutionContext(TaskMessageDTO taskMessage, Map<String, Object> payload) {

    public String payloadString(String key, String defaultValue) {
        Object value = payload.get(key);
        return value == null ? defaultValue : String.valueOf(value);
    }

    public String payloadString(String key) {
        return payloadString(key, "");
    }
}
