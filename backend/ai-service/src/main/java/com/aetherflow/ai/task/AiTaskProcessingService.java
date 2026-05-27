package com.aetherflow.ai.task;

import com.aetherflow.common.dto.TaskMessageDTO;

public interface AiTaskProcessingService {

    void process(TaskMessageDTO taskMessage);
}
