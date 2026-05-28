package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.mapper.WorkflowRuntimeEventMapper;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

@Repository
@RequiredArgsConstructor
public class MybatisRuntimeEventStore implements RuntimeEventStore {

    private static final TypeReference<Map<String, Object>> ATTRIBUTES_TYPE = new TypeReference<>() {
    };

    private final WorkflowRuntimeEventMapper mapper;
    private final ObjectMapper objectMapper;

    @Override
    public void append(RuntimeEvent event) {
        if (event == null) {
            return;
        }
        RuntimeEventEntity existing = mapper.selectOne(new LambdaQueryWrapper<RuntimeEventEntity>()
                .eq(RuntimeEventEntity::getEventId, event.eventId())
                .last("LIMIT 1"));
        RuntimeEventEntity entity = toEntity(event, existing);
        if (existing == null) {
            mapper.insert(entity);
        } else {
            mapper.updateById(entity);
        }
    }

    @Override
    public List<RuntimeEvent> findByWorkflowId(String workflowId) {
        if (workflowId == null || workflowId.isBlank()) {
            return List.of();
        }
        return mapper.selectList(new LambdaQueryWrapper<RuntimeEventEntity>()
                        .eq(RuntimeEventEntity::getWorkflowId, workflowId)
                        .orderByAsc(RuntimeEventEntity::getOccurredAt)
                        .orderByAsc(RuntimeEventEntity::getId))
                .stream()
                .map(this::toEvent)
                .toList();
    }

    private RuntimeEventEntity toEntity(RuntimeEvent event, RuntimeEventEntity existing) {
        LocalDateTime now = LocalDateTime.now();
        RuntimeEventEntity entity = new RuntimeEventEntity();
        if (existing != null) {
            entity.setId(existing.getId());
            entity.setCreatedAt(existing.getCreatedAt());
        } else {
            entity.setCreatedAt(now);
        }
        entity.setEventId(event.eventId());
        entity.setWorkflowId(event.workflowId());
        entity.setTraceId(event.traceId());
        entity.setTaskId(event.taskId());
        entity.setEventType(event.eventType().name());
        entity.setNodeId(event.nodeId());
        entity.setRuntimeState(event.runtimeState().name());
        entity.setOccurredAt(toDateTime(event.occurredAt()));
        entity.setAttributesJson(writeJson(event.attributes()));
        entity.setUpdatedAt(now);
        return entity;
    }

    private RuntimeEvent toEvent(RuntimeEventEntity entity) {
        return new RuntimeEvent(
                entity.getEventId(),
                RuntimeEventType.valueOf(entity.getEventType()),
                entity.getWorkflowId(),
                entity.getTraceId(),
                entity.getTaskId(),
                entity.getNodeId(),
                RuntimeState.valueOf(entity.getRuntimeState()),
                toInstant(entity.getOccurredAt()),
                readJson(entity.getAttributesJson(), ATTRIBUTES_TYPE)
        );
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("runtime event json serialization failed", exception);
        }
    }

    private Map<String, Object> readJson(String json, TypeReference<Map<String, Object>> type) {
        try {
            if (json == null || json.isBlank()) {
                return Map.of();
            }
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("runtime event json deserialization failed", exception);
        }
    }

    private LocalDateTime toDateTime(Instant instant) {
        return (instant == null ? Instant.now() : instant).atZone(ZoneId.systemDefault()).toLocalDateTime();
    }

    private Instant toInstant(LocalDateTime dateTime) {
        LocalDateTime value = dateTime == null ? LocalDateTime.now() : dateTime;
        return value.atZone(ZoneId.systemDefault()).toInstant();
    }
}
