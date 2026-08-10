package com.aetherflow.workflow.runtime.async;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.NotifyMessageDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

// pattern: Imperative Shell
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowAiResultListener {

    private final WorkflowAsyncCompletionService completionService;

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
        String nodeId = payload.get("nodeId") == null ? null : String.valueOf(payload.get("nodeId"));
        if (workflowInstanceId == null || nodeId == null || nodeId.isBlank()) {
            log.warn("AI result event ignored because workflow or node identity is missing");
            return;
        }
        if ("AI_TASK_FAILED".equals(message.getEventType())) {
            completionService.completeFailure(workflowInstanceId, nodeId,
                    payload.get("error") == null ? null : String.valueOf(payload.get("error")));
            return;
        }
        completionService.completeSuccess(workflowInstanceId, nodeId, output(payload.get("output")));
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
            if (key != null) {
                result.put(String.valueOf(key), item);
            }
        });
        return Map.copyOf(result);
    }
}
