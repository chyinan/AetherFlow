package com.aetherflow.task.support;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.entity.Task;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class TaskMessageFactory {

    private static final TypeReference<LinkedHashMap<String, Object>> PAYLOAD_TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    public TaskMessageDTO from(Task task) {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(task.getId());
        message.setWorkflowInstanceId(task.getWorkflowInstanceId());
        message.setNodeId(task.getNodeId());
        message.setNodeType(task.getNodeType());
        message.setPayload(readPayload(task.getPayloadJson()));
        message.setRetryCount(task.getRetryCount() == null ? 0 : task.getRetryCount());
        message.setCreatedAt(toOffsetDateTime(task.getCreatedAt()));
        return message;
    }

    public String writePayload(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload == null ? Map.of() : payload);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "task payload json serialization failed");
        }
    }

    private Map<String, Object> readPayload(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(payloadJson, PAYLOAD_TYPE);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "task payload json deserialization failed");
        }
    }

    private OffsetDateTime toOffsetDateTime(LocalDateTime localDateTime) {
        LocalDateTime value = localDateTime == null ? LocalDateTime.now() : localDateTime;
        return value.atZone(ZoneId.systemDefault()).toOffsetDateTime();
    }
}
