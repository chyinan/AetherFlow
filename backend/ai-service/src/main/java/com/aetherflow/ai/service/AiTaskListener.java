package com.aetherflow.ai.service;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.ai.task.AiTaskProcessingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class AiTaskListener {

    private final AiTaskProcessingService aiTaskProcessingService;

    @RabbitListener(queues = RabbitMqNames.AI_TASK_QUEUE, concurrency = "${aetherflow.ai.listener-concurrent-consumers:2}")
    public void handleAiTask(TaskMessageDTO taskMessage) {
        log.info("Received AI task from RabbitMQ taskId={}, nodeType={}",
                taskMessage == null ? null : taskMessage.getTaskId(),
                taskMessage == null ? null : taskMessage.getNodeType());
        aiTaskProcessingService.process(taskMessage);
    }
}

