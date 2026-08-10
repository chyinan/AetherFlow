package com.aetherflow.ai.service;

import com.aetherflow.ai.task.AiTaskProcessingService;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiTaskListenerTest {

    @Test
    void restoresMqTraceForProcessingAndClearsItAfterwards() {
        AtomicReference<String> observedTrace = new AtomicReference<>();
        AiTaskProcessingService processingService = message -> observedTrace.set(MDC.get("traceId"));
        AiTaskListener listener = new AiTaskListener(processingService);
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(1L);
        message.setNodeType("LLM");
        message.setTraceId("trace-mq-1");

        listener.handleAiTask(message);

        assertThat(observedTrace.get()).isEqualTo("trace-mq-1");
        assertThat(MDC.get("traceId")).isNull();
    }

    @Test
    void rejectsUntraceableMqTask() {
        AiTaskListener listener = new AiTaskListener(message -> { });

        assertThatThrownBy(() -> listener.handleAiTask(new TaskMessageDTO()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("trace id");
    }
}
