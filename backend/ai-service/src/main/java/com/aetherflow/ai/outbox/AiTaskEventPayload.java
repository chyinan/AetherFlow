package com.aetherflow.ai.outbox;

import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.TaskMessageDTO;

// pattern: Functional Core
public record AiTaskEventPayload(
        TaskMessageDTO taskMessage,
        AiNodeResult result,
        String error
) {
}
