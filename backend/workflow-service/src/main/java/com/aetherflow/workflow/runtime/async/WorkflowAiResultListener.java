package com.aetherflow.workflow.runtime.async;

// pattern: Imperative Shell

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.LinkedHashMap;
import java.util.Map;

// pattern: Imperative Shell
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowAiResultListener {

    private final WorkflowAsyncCompletionService completionService;

    @Autowired(required = false)
    private WorkflowInstanceMapper workflowInstanceMapper;

    @RabbitListener(queues = RabbitMqNames.WORKFLOW_AI_RESULT_QUEUE)
    public void handle(NotifyMessageDTO message) {
        if (message == null
                || (!"AI_TASK_SUCCEEDED".equals(message.getEventType())
                && !"AI_TASK_FAILED".equals(message.getEventType()))) {
            return;
        }
        Map<String, Object> payload = message.getPayload();
        if (payload == null) {
            log.warn("AI result event ignored because payload is missing");
            return;
        }
        Long workflowInstanceId = toLong(payload.get("workflowInstanceId"));
        Long taskId = toLong(payload.get("taskId"));
        String nodeId = payload.get("nodeId") == null ? null : String.valueOf(payload.get("nodeId"));
        if (workflowInstanceId == null || nodeId == null || nodeId.isBlank()) {
            log.warn("AI result event ignored because workflow or node identity is missing");
            return;
        }
        if ("AI_TASK_FAILED".equals(message.getEventType())) {
            String error = payload.get("error") == null ? null : String.valueOf(payload.get("error"));
            try {
                if (taskId == null) {
                    completionService.completeFailure(workflowInstanceId, nodeId, error);
                } else {
                    completionService.completeFailure(workflowInstanceId, nodeId, taskId, error);
                }
            } catch (IllegalStateException exception) {
                if (isStaleCompletion(exception)) {
                    log.warn("stale AI failure event ignored, workflowInstanceId={}, nodeId={}, taskId={}",
                            workflowInstanceId, nodeId, taskId);
                    return;
                }
                throw exception;
            }
            return;
        }
        if (!belongsToMessageUser(workflowInstanceId, message, payload)) {
            log.warn("AI result event ignored because user scope does not match workflowInstanceId={}", workflowInstanceId);
            return;
        }
        try {
            if (taskId == null) {
                completionService.completeSuccess(workflowInstanceId, nodeId, output(payload.get("output")));
            } else {
                completionService.completeSuccess(workflowInstanceId, nodeId, taskId, output(payload.get("output")));
            }
        } catch (IllegalStateException exception) {
            if (isStaleCompletion(exception)) {
                log.warn("stale AI success event ignored, workflowInstanceId={}, nodeId={}, taskId={}",
                        workflowInstanceId, nodeId, taskId);
                return;
            }
            throw exception;
        }
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null ? null : Long.valueOf(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Map<String, Object> output(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            return Map.of();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        raw.forEach((key, item) -> {
            if (key != null && item != null) {
                result.put(String.valueOf(key), item);
            }
        });
        return Map.copyOf(result);
    }

    private boolean isStaleCompletion(IllegalStateException exception) {
        String message = exception.getMessage();
        return message != null && (message.startsWith("stale external AI completion")
                || message.startsWith("invalid external AI task identity"));
    }

    private boolean belongsToMessageUser(Long workflowInstanceId,
                                         NotifyMessageDTO message,
                                         Map<String, Object> payload) {
        if (workflowInstanceMapper == null) {
            return true;
        }
        WorkflowInstance instance = workflowInstanceMapper.selectById(workflowInstanceId);
        if (instance == null) {
            return false;
        }
        Object rawUserId = message.getUserId() == null ? payload.get("userId") : message.getUserId();
        Long eventUserId = toLong(rawUserId);
        return eventUserId != null && eventUserId.equals(instance.getUserId());
    }
}
