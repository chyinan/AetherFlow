package com.aetherflow.ai.task;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AiTaskDeferredRetryPublisherTest {

    @Test
    void publishesToDurableDelayBucketAndWaitsForBrokerAck() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        doAnswer(invocation -> {
            CorrelationData correlationData = invocation.getArgument(3);
            correlationData.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(rabbitTemplate).convertAndSend(
                any(String.class), any(String.class), any(TaskMessageDTO.class), any(CorrelationData.class));
        AiTaskDeferredRetryPublisher publisher = new AiTaskDeferredRetryPublisher(rabbitTemplate);
        TaskMessageDTO message = message();

        publisher.defer(message, Duration.ofSeconds(30));

        verify(rabbitTemplate).convertAndSend(
                eq(RabbitMqNames.AI_TASK_RETRY_EXCHANGE),
                eq(RabbitMqNames.AI_TASK_RETRY_MEDIUM_ROUTING_KEY),
                eq(message),
                any(CorrelationData.class));
    }

    @Test
    void brokerNackKeepsOriginalListenerDeliveryFailed() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        doAnswer(invocation -> {
            CorrelationData correlationData = invocation.getArgument(3);
            correlationData.getFuture().complete(new CorrelationData.Confirm(false, "nack"));
            return null;
        }).when(rabbitTemplate).convertAndSend(
                any(String.class), any(String.class), any(TaskMessageDTO.class), any(CorrelationData.class));
        AiTaskDeferredRetryPublisher publisher = new AiTaskDeferredRetryPublisher(rabbitTemplate);

        assertThatThrownBy(() -> publisher.defer(message(), Duration.ofSeconds(5)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("publish failed");
    }

    private TaskMessageDTO message() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setNodeId("node-1");
        message.setTraceId("trace-59");
        return message;
    }
}
