package com.aetherflow.ai.callback;

import com.aetherflow.ai.client.TaskStatusClient;
import com.aetherflow.ai.config.TaskClientProperties;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
public class AiTaskCallbackService {

    private final RabbitTemplate rabbitTemplate;
    private final RestClient callbackRestClient;
    private final TaskStatusClient taskStatusClient;
    private final TaskClientProperties taskClientProperties;

    public AiTaskCallbackService(RabbitTemplate rabbitTemplate,
                                 @Qualifier("aiCallbackRestClient") RestClient callbackRestClient,
                                 TaskStatusClient taskStatusClient,
                                 TaskClientProperties taskClientProperties) {
        this.rabbitTemplate = rabbitTemplate;
        this.callbackRestClient = callbackRestClient;
        this.taskStatusClient = taskStatusClient;
        this.taskClientProperties = taskClientProperties;
    }

    public void notifySuccess(TaskMessageDTO taskMessage, AiNodeResult result) {
        Map<String, Object> payload = basePayload(taskMessage);
        payload.put("status", result.status());
        payload.put("output", result.output());
        payload.put("artifacts", result.artifacts());
        publishNotify("AI_TASK_SUCCEEDED", payload);
        markTaskSucceeded(taskMessage);
        invokeCallbackUrl(taskMessage, payload);
    }

    public void notifyFailure(TaskMessageDTO taskMessage, String message) {
        Map<String, Object> payload = basePayload(taskMessage);
        payload.put("status", "FAILED");
        payload.put("error", message);
        publishNotify("AI_TASK_FAILED", payload);
        invokeCallbackUrl(taskMessage, payload);
    }

    private Map<String, Object> basePayload(TaskMessageDTO taskMessage) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", taskMessage.getTaskId());
        payload.put("workflowInstanceId", taskMessage.getWorkflowInstanceId());
        payload.put("nodeId", taskMessage.getNodeId());
        payload.put("nodeType", taskMessage.getNodeType());
        return payload;
    }

    private void publishNotify(String eventType, Map<String, Object> payload) {
        NotifyMessageDTO notifyMessage = new NotifyMessageDTO();
        notifyMessage.setEventId(eventId(eventType, payload));
        notifyMessage.setEventType(eventType);
        notifyMessage.setChannel("WORKFLOW");
        notifyMessage.setPayload(payload);
        notifyMessage.setOccurredAt(OffsetDateTime.now());
        rabbitTemplate.convertAndSend(RabbitMqNames.NOTIFY_EXCHANGE, RabbitMqNames.NOTIFY_ROUTING_KEY, notifyMessage);
    }

    private String eventId(String eventType, Map<String, Object> payload) {
        Object taskId = payload.get("taskId");
        Object nodeId = payload.get("nodeId");
        if (taskId == null) {
            return eventType;
        }
        return "ai-task:" + taskId + ":" + (nodeId == null ? "" : nodeId) + ":" + eventType;
    }

    private void markTaskSucceeded(TaskMessageDTO taskMessage) {
        if (taskMessage.getTaskId() == null) {
            return;
        }
        try {
            taskStatusClient.markSucceeded(taskClientProperties.getInternalToken(), taskMessage.getTaskId());
        } catch (RuntimeException exception) {
            log.warn("task-service success status callback failed, taskId={}", taskMessage.getTaskId(), exception);
        }
    }

    private void invokeCallbackUrl(TaskMessageDTO taskMessage, Map<String, Object> payload) {
        Object callbackUrl = taskMessage.getPayload() == null ? null : taskMessage.getPayload().get("callbackUrl");
        if (callbackUrl == null || String.valueOf(callbackUrl).isBlank()) {
            return;
        }
        try {
            callbackRestClient.post()
                    .uri(String.valueOf(callbackUrl))
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
            log.info("AI task callback sent taskId={}, callbackUrl={}", taskMessage.getTaskId(), callbackUrl);
        } catch (RuntimeException exception) {
            log.warn("AI task callback failed taskId={}, callbackUrl={}", taskMessage.getTaskId(), callbackUrl, exception);
        }
    }
}
