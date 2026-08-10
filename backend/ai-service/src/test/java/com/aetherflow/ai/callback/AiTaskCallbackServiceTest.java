package com.aetherflow.ai.callback;

import com.aetherflow.ai.client.TaskStatusClient;
import com.aetherflow.ai.config.TaskClientProperties;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.dto.NotifyMessageDTO;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.assertThat;

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

        verify(taskStatusClient).markSucceeded(any(String.class), eq(59L));
    }

    @Test
    void doesNotFailAiProcessingWhenTaskStatusCallbackIsUnavailable() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        RestClient restClient = mock(RestClient.class);
        TaskStatusClient taskStatusClient = mock(TaskStatusClient.class);
        doThrow(new IllegalStateException("task-service down")).when(taskStatusClient).markSucceeded(any(String.class), eq(59L));
        AiTaskCallbackService service = new AiTaskCallbackService(rabbitTemplate, restClient, taskStatusClient, properties());
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult("AI_TRANSCRIPTION", "SUCCEEDED", Map.of("text", "done"), List.of());

        service.notifySuccess(message, result);

        verify(taskStatusClient).markSucceeded(any(String.class), eq(59L));
    }

    @Test
    void propagatesTraceIdToNotificationAndCallbackPayload() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        RestClient restClient = mock(RestClient.class);
        TaskStatusClient taskStatusClient = mock(TaskStatusClient.class);
        AiTaskCallbackService service = new AiTaskCallbackService(rabbitTemplate, restClient, taskStatusClient, properties());
        TaskMessageDTO message = taskMessage();
        message.setTraceId("trace-ai-59");

        service.notifySuccess(message,
                new AiNodeResult("AI_TRANSCRIPTION", "SUCCEEDED", Map.of("text", "done"), List.of()));

        ArgumentCaptor<NotifyMessageDTO> captor = ArgumentCaptor.forClass(NotifyMessageDTO.class);
        verify(rabbitTemplate).convertAndSend(any(String.class), any(String.class), captor.capture());
        assertThat(captor.getValue().getTraceId()).isEqualTo("trace-ai-59");
        assertThat(captor.getValue().getPayload()).containsEntry("traceId", "trace-ai-59");
    }

    @Test
    void marksTaskFailedWhenAiTaskFails() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        RestClient restClient = mock(RestClient.class);
        TaskStatusClient taskStatusClient = mock(TaskStatusClient.class);
        AiTaskCallbackService service = new AiTaskCallbackService(rabbitTemplate, restClient, taskStatusClient, properties());

        service.notifyFailure(taskMessage(), "provider unavailable");

        verify(taskStatusClient).markFailed(any(String.class), eq(59L));
    }

    private TaskClientProperties properties() {
        TaskClientProperties properties = new TaskClientProperties();
        properties.setInternalToken("0123456789abcdef0123456789abcdef");
        return properties;
    }

    private TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(100L);
        message.setTraceId("trace-59");
        message.setNodeId("node-1");
        message.setNodeType("AI_TRANSCRIPTION");
        message.setPayload(Map.of());
        return message;
    }
}
