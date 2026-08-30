package com.aetherflow.ai.outbox;

import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.task.AiTaskStatus;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

// pattern: Imperative Shell
@Service
@RequiredArgsConstructor
public class AiTaskTerminalPersistenceService {

    private final AiJobMapper jobMapper;
    private final AiTaskEventOutboxMapper outboxMapper;
    private final ObjectMapper objectMapper;

    @Transactional(rollbackFor = Exception.class)
    public AiTaskEventOutbox recordSuccess(AiJob job,
                                           TaskMessageDTO taskMessage,
                                           AiNodeResult result) {
        LocalDateTime now = LocalDateTime.now();
        job.setOutputJson(writeJson(result.output()));
        job.setStatus(AiTaskStatus.SUCCEEDED);
        job.setCompletedAt(now);
        job.setUpdatedAt(now);
        jobMapper.updateById(job);
        return insertOrRead(event(job, taskMessage, "AI_TASK_SUCCEEDED",
                new AiTaskEventPayload(taskMessage, result, null), now));
    }

    @Transactional(rollbackFor = Exception.class)
    public AiTaskEventOutbox recordFailure(AiJob job,
                                           TaskMessageDTO taskMessage,
                                           String error) {
        LocalDateTime now = LocalDateTime.now();
        job.setOutputJson(writeJson(Map.of("error", safeError(error))));
        job.setStatus(AiTaskStatus.FAILED);
        job.setCompletedAt(now);
        job.setUpdatedAt(now);
        jobMapper.updateById(job);
        return insertOrRead(event(job, taskMessage, "AI_TASK_FAILED",
                new AiTaskEventPayload(taskMessage, null, safeError(error)), now));
    }

    private AiTaskEventOutbox event(AiJob job,
                                    TaskMessageDTO taskMessage,
                                    String eventType,
                                    AiTaskEventPayload payload,
                                    LocalDateTime now) {
        AiTaskEventOutbox event = new AiTaskEventOutbox();
        event.setAiJobId(job.getId());
        event.setTaskId(taskMessage.getTaskId());
        event.setEventId(eventId(taskMessage, eventType));
        event.setEventType(eventType);
        event.setPayloadJson(writeJson(payload));
        event.setStatus(AiTaskEventOutbox.PENDING);
        event.setAttemptCount(0);
        event.setNextAttemptAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        return event;
    }

    private AiTaskEventOutbox insertOrRead(AiTaskEventOutbox event) {
        try {
            outboxMapper.insert(event);
            return event;
        } catch (DuplicateKeyException duplicate) {
            return outboxMapper.selectOne(new LambdaQueryWrapper<AiTaskEventOutbox>()
                    .eq(AiTaskEventOutbox::getEventId, event.getEventId())
                    .last("LIMIT 1"));
        }
    }

    private String eventId(TaskMessageDTO message, String eventType) {
        String nodeId = message.getNodeId() == null ? "" : message.getNodeId();
        return "ai-task:" + message.getTaskId() + ":" + nodeId + ":" + eventType;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "ai task outbox json serialization failed");
        }
    }

    private String safeError(String error) {
        return error == null || error.isBlank() ? "AI task failed" : error.trim();
    }
}
