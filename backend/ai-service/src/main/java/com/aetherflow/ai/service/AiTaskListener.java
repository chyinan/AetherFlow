package com.aetherflow.ai.service;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.TaskMessageDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AiTaskListener {

    private final AiInferenceService aiInferenceService;

    @RabbitListener(queues = RabbitMqNames.AI_TASK_QUEUE)
    public void handleAiTask(TaskMessageDTO taskMessage) {
        aiInferenceService.processTask(taskMessage);
    }
}

