package com.aetherflow.ai.outbox;

import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.TaskMessageDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

// pattern: Imperative Shell
@Service
@RequiredArgsConstructor
public class AiTaskTerminalCoordinator {

    private final AiTaskTerminalPersistenceService persistenceService;
    private final AiTaskEventOutboxPublisher publisher;

    public void recordSuccess(AiJob job, TaskMessageDTO taskMessage, AiNodeResult result) {
        AiTaskEventOutbox event = persistenceService.recordSuccess(job, taskMessage, result);
        publisher.publish(event);
    }

    public void recordFailure(AiJob job, TaskMessageDTO taskMessage, String error) {
        AiTaskEventOutbox event = persistenceService.recordFailure(job, taskMessage, error);
        publisher.publish(event);
    }

    public int publishPending(AiJob job) {
        return publisher.publishPendingForJob(job);
    }
}
