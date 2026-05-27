package com.aetherflow.task.service.impl;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.entity.TaskRecord;
import com.aetherflow.task.mapper.TaskRecordMapper;
import com.aetherflow.task.service.TaskDispatchService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class TaskDispatchServiceImpl implements TaskDispatchService {

    private static final String STATUS_PENDING = "PENDING";

    private final TaskRecordMapper taskRecordMapper;
    private final RabbitTemplate rabbitTemplate;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long dispatch(TaskMessageDTO taskMessage) {
        TaskRecord record = new TaskRecord();
        record.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        record.setNodeId(taskMessage.getNodeId());
        record.setNodeType(taskMessage.getNodeType());
        record.setPayloadJson(writeJson(taskMessage.getPayload()));
        record.setRetryCount(taskMessage.getRetryCount() == null ? 0 : taskMessage.getRetryCount());
        record.setStatus(STATUS_PENDING);
        record.setNextRetryAt(LocalDateTime.now().plusMinutes(10));
        record.setCreatedAt(LocalDateTime.now());
        record.setUpdatedAt(LocalDateTime.now());
        taskRecordMapper.insert(record);

        taskMessage.setTaskId(record.getId());
        taskMessage.setCreatedAt(OffsetDateTime.now());
        redisTemplate.opsForValue().set("aetherflow:task:" + record.getId(), STATUS_PENDING, Duration.ofHours(2));
        rabbitTemplate.convertAndSend(RabbitMqNames.TASK_EXCHANGE, RabbitMqNames.AI_TASK_ROUTING_KEY, taskMessage);
        return record.getId();
    }

    @Override
    public void compensateTimeouts() {
        // The first scaffold exposes the XXL-Job entry point. Batch paging and idempotent requeueing belong in the next task phase.
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "task payload json serialization failed");
        }
    }
}

