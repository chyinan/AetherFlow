package com.aetherflow.workflow.runtime.notification;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.workflow.client.NotifyInternalClient;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
// pattern: Imperative Shell
public class WorkflowTerminalNotificationOutboxService {

    private final WorkflowTerminalNotificationOutboxMapper mapper;
    private final NotifyInternalClient notifyInternalClient;
    private final ObjectMapper objectMapper;

    public void enqueue(Long workflowInstanceId,
                        Long userId,
                        String traceId,
                        RuntimeState state,
                        String currentNodeId) {
        if (workflowInstanceId == null || userId == null || userId <= 0 || !isTerminal(state)) {
            return;
        }
        String eventType = eventType(state);
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setUserId(userId);
        message.setTraceId(traceId);
        message.setEventId("workflow:" + workflowInstanceId + ":" + state.name());
        message.setChannel("WORKFLOW");
        message.setEventType(eventType);
        message.setOccurredAt(OffsetDateTime.now());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("workflowInstanceId", workflowInstanceId);
        payload.put("status", state.name());
        payload.put("currentNodeId", currentNodeId);
        payload.put("title", eventType);
        message.setPayload(payload);

        WorkflowTerminalNotificationOutbox outbox = new WorkflowTerminalNotificationOutbox();
        outbox.setWorkflowInstanceId(workflowInstanceId);
        outbox.setUserId(userId);
        outbox.setEventId(message.getEventId());
        outbox.setStatus(WorkflowTerminalNotificationOutbox.PENDING);
        outbox.setAttemptCount(0);
        outbox.setPayloadJson(writeJson(message));
        outbox.setNextAttemptAt(LocalDateTime.now());
        outbox.setCreatedAt(LocalDateTime.now());
        outbox.setUpdatedAt(LocalDateTime.now());
        try {
            mapper.insert(outbox);
        } catch (DuplicateKeyException duplicate) {
            log.debug("workflow terminal notification already enqueued, eventId={}", message.getEventId());
        }
    }

    @Scheduled(fixedDelayString = "${aetherflow.workflow.notification-outbox.fixed-delay:5000}")
    public int dispatchDue() {
        LocalDateTime now = LocalDateTime.now();
        List<WorkflowTerminalNotificationOutbox> due = mapper.selectDue(now, now.minusMinutes(10), 100);
        if (due == null) {
            due = List.of();
        }
        int dispatched = 0;
        for (WorkflowTerminalNotificationOutbox outbox : due) {
            if (outbox == null || mapper.claim(outbox.getId(), now, now.minusMinutes(10)) != 1) {
                continue;
            }
            try {
                Result<Void> result = notifyInternalClient.send(readMessage(outbox.getPayloadJson()));
                if (result == null || !result.isSuccess()) {
                    throw new IllegalStateException(result == null ? "notify service returned no result" : result.getMessage());
                }
                mapper.markDispatched(outbox.getId(), LocalDateTime.now());
                dispatched++;
            } catch (RuntimeException exception) {
                mapper.markRetry(outbox.getId(), LocalDateTime.now().plusSeconds(10),
                        truncate(exception.getMessage()), LocalDateTime.now());
                log.warn("workflow terminal notification dispatch failed, eventId={}", outbox.getEventId(), exception);
            }
        }
        return dispatched;
    }

    private NotifyMessageDTO readMessage(String json) {
        try {
            return objectMapper.readValue(json, NotifyMessageDTO.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("workflow terminal notification payload is invalid", exception);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("workflow terminal notification payload serialization failed", exception);
        }
    }

    private String truncate(String value) {
        String message = value == null || value.isBlank() ? "notification dispatch failed" : value;
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }

    private boolean isTerminal(RuntimeState state) {
        return state == RuntimeState.SUCCESS || state == RuntimeState.FAILED || state == RuntimeState.CANCELLED;
    }

    private String eventType(RuntimeState state) {
        return switch (state) {
            case SUCCESS -> "WORKFLOW_COMPLETED";
            case FAILED -> "WORKFLOW_FAILED";
            case CANCELLED -> "WORKFLOW_CANCELLED";
            default -> throw new IllegalArgumentException("workflow state is not terminal: " + state);
        };
    }
}
