package com.aetherflow.ai.service;

// pattern: Imperative Shell

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.ai.task.AiJobLeaseBusyException;
import com.aetherflow.ai.task.AiTaskDeferredRetryPublisher;
import com.aetherflow.ai.task.AiTaskProcessingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.slf4j.MDC;

@Slf4j
@Component
@RequiredArgsConstructor
public class AiTaskListener {

    private final AiTaskProcessingService aiTaskProcessingService;
    private final AiTaskDeferredRetryPublisher deferredRetryPublisher;

    @RabbitListener(
            queues = RabbitMqNames.AI_TASK_QUEUE,
            concurrency = "${aetherflow.ai.listener-concurrent-consumers:2}-${aetherflow.ai.listener-max-concurrent-consumers:6}")
    public void handleAiTask(TaskMessageDTO taskMessage) {
        String traceId = taskMessage == null ? null : taskMessage.getTraceId();
        if (traceId == null || traceId.isBlank()) {
            throw new IllegalArgumentException("AI task trace id is required");
        }
        try (MDC.MDCCloseable ignored = MDC.putCloseable("traceId", traceId)) {
            log.info("Received AI task from RabbitMQ taskId={}, nodeType={}",
                    taskMessage.getTaskId(), taskMessage.getNodeType());
            try {
                aiTaskProcessingService.process(taskMessage);
            } catch (AiJobLeaseBusyException busy) {
                deferredRetryPublisher.defer(taskMessage, busy.retryAfter());
                log.info("Deferred duplicate AI task until lease can be reacquired taskId={} retryAfter={}",
                        taskMessage.getTaskId(), busy.retryAfter());
            }
        }
    }
}

