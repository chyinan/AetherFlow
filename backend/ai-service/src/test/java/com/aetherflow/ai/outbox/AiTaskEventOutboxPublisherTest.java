package com.aetherflow.ai.outbox;

import com.aetherflow.ai.callback.AiTaskCallbackService;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class AiTaskEventOutboxPublisherTest {

    @Test
    void claimsPublishesAndMarksSuccessEventPublished() throws Exception {
        AiTaskEventOutboxMapper mapper = mock(AiTaskEventOutboxMapper.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        AiTaskEventOutboxPublisher publisher = new AiTaskEventOutboxPublisher(
                mapper, callbackService, objectMapper);
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult(
                "LLM", "SUCCEEDED", Map.of("completionText", "done"), List.of());
        AiTaskEventOutbox event = event(objectMapper.writeValueAsString(
                new AiTaskEventPayload(message, result, null)));
        when(mapper.claimForPublishing(eq(501L), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1);

        boolean published = publisher.publish(event);

        assertThat(published).isTrue();
        verify(callbackService).notifySuccess(eq(message), any(AiNodeResult.class));
        assertThat(event.getStatus()).isEqualTo(AiTaskEventOutbox.PUBLISHED);
        assertThat(event.getPublishedAt()).isNotNull();
        verify(mapper).updateById(event);
    }

    @Test
    void publishFailureReturnsEventToPendingWithBackoff() throws Exception {
        AiTaskEventOutboxMapper mapper = mock(AiTaskEventOutboxMapper.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        AiTaskEventOutboxPublisher publisher = new AiTaskEventOutboxPublisher(
                mapper, callbackService, objectMapper);
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult(
                "LLM", "SUCCEEDED", Map.of("completionText", "done"), List.of());
        AiTaskEventOutbox event = event(objectMapper.writeValueAsString(
                new AiTaskEventPayload(message, result, null)));
        when(mapper.claimForPublishing(eq(501L), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1);
        doThrow(new IllegalStateException()).when(callbackService).notifySuccess(any(), any());
        LocalDateTime beforePublish = LocalDateTime.now();

        boolean published = publisher.publish(event);

        assertThat(published).isFalse();
        assertThat(event.getStatus()).isEqualTo(AiTaskEventOutbox.PENDING);
        assertThat(event.getAttemptCount()).isEqualTo(1);
        assertThat(event.getNextAttemptAt()).isAfter(beforePublish);
        assertThat(event.getLastError()).isEqualTo(
                "AI task outbox publish failed: IllegalStateException");
        verify(mapper).updateById(event);
    }

    private AiTaskEventOutbox event(String payloadJson) {
        AiTaskEventOutbox event = new AiTaskEventOutbox();
        event.setId(501L);
        event.setAiJobId(100L);
        event.setTaskId(59L);
        event.setEventId("ai-task:59:node-1:AI_TASK_SUCCEEDED");
        event.setEventType("AI_TASK_SUCCEEDED");
        event.setPayloadJson(payloadJson);
        event.setStatus(AiTaskEventOutbox.PENDING);
        event.setAttemptCount(0);
        event.setNextAttemptAt(LocalDateTime.now());
        event.setCreatedAt(LocalDateTime.now());
        event.setUpdatedAt(LocalDateTime.now());
        return event;
    }

    private TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(101L);
        message.setTraceId("trace-59");
        message.setNodeId("node-1");
        message.setNodeType("LLM");
        message.setPayload(Map.of("prompt", "summarize"));
        return message;
    }
}
