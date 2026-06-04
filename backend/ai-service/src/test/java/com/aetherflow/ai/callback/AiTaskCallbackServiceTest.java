package com.aetherflow.ai.callback;

import com.aetherflow.ai.client.TaskStatusClient;
import com.aetherflow.ai.config.TaskClientProperties;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AiTaskCallbackServiceTest {

    @Test
    void marksTaskSucceededWhenAiTaskSucceeds() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        RestClient restClient = mock(RestClient.class);
        TaskStatusClient taskStatusClient = mock(TaskStatusClient.class);
        AiTaskCallbackService service = new AiTaskCallbackService(rabbitTemplate, restClient, taskStatusClient, properties());
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult("AI_TRANSCRIPTION", "SUCCEEDED", Map.of("text", "done"), List.of());

        service.notifySuccess(message, result);

        verify(taskStatusClient).markSucceeded("expected-token", 59L);
    }

    @Test
    void doesNotFailAiProcessingWhenTaskStatusCallbackIsUnavailable() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        RestClient restClient = mock(RestClient.class);
        TaskStatusClient taskStatusClient = mock(TaskStatusClient.class);
        doThrow(new IllegalStateException("task-service down")).when(taskStatusClient).markSucceeded("expected-token", 59L);
        AiTaskCallbackService service = new AiTaskCallbackService(rabbitTemplate, restClient, taskStatusClient, properties());
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult("AI_TRANSCRIPTION", "SUCCEEDED", Map.of("text", "done"), List.of());

        service.notifySuccess(message, result);

        verify(taskStatusClient).markSucceeded("expected-token", 59L);
    }

    private TaskClientProperties properties() {
        TaskClientProperties properties = new TaskClientProperties();
        properties.setInternalToken("expected-token");
        return properties;
    }

    private TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(100L);
        message.setNodeId("node-1");
        message.setNodeType("AI_TRANSCRIPTION");
        message.setPayload(Map.of());
        return message;
    }
}
