package com.aetherflow.ai.service;

import com.aetherflow.ai.task.AiTaskProcessingService;
import com.aetherflow.ai.task.AiJobLeaseBusyException;
import com.aetherflow.ai.task.AiTaskDeferredRetryPublisher;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.util.concurrent.atomic.AtomicReference;
import java.time.Duration;
import org.springframework.amqp.rabbit.annotation.RabbitListener;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class AiTaskListenerTest {

    @Test
    void restoresMqTraceForProcessingAndClearsItAfterwards() {
        AtomicReference<String> observedTrace = new AtomicReference<>();
        AiTaskProcessingService processingService = message -> observedTrace.set(MDC.get("traceId"));
        AiTaskDeferredRetryPublisher retryPublisher = mock(AiTaskDeferredRetryPublisher.class);
        AiTaskListener listener = new AiTaskListener(processingService, retryPublisher);
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(1L);
        message.setNodeType("LLM");
        message.setTraceId("trace-mq-1");

        listener.handleAiTask(message);

        assertThat(observedTrace.get()).isEqualTo("trace-mq-1");
        assertThat(MDC.get("traceId")).isNull();
        verify(retryPublisher, never()).defer(message, Duration.ZERO);
    }

    @Test
    void rejectsUntraceableMqTask() {
        AiTaskListener listener = new AiTaskListener(message -> { }, mock(AiTaskDeferredRetryPublisher.class));

        assertThatThrownBy(() -> listener.handleAiTask(new TaskMessageDTO()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("trace id");
    }

    @Test
    void activeLeaseMessageIsRepublishedDurablyInsteadOfBeingAcknowledgedAndLost() {
        AiTaskProcessingService processingService = message -> {
            throw new AiJobLeaseBusyException(Duration.ofSeconds(30));
        };
        AiTaskDeferredRetryPublisher retryPublisher = mock(AiTaskDeferredRetryPublisher.class);
        AiTaskListener listener = new AiTaskListener(processingService, retryPublisher);
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(1L);
        message.setNodeType("LLM");
        message.setTraceId("trace-mq-lease");

        listener.handleAiTask(message);

        verify(retryPublisher).defer(message, Duration.ofSeconds(30));
    }

    @Test
    void listenerCanScaleBetweenConfiguredMinimumAndMaximumConsumers() throws Exception {
        RabbitListener annotation = AiTaskListener.class
                .getMethod("handleAiTask", TaskMessageDTO.class)
                .getAnnotation(RabbitListener.class);

        assertThat(annotation.concurrency()).isEqualTo(
                "${aetherflow.ai.listener-concurrent-consumers:2}-${aetherflow.ai.listener-max-concurrent-consumers:6}");
    }
}
