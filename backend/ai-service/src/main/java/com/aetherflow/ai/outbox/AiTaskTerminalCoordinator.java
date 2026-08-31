package com.aetherflow.ai.outbox;

import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.task.AiJobLease;
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

    public void recordSuccess(AiJob job, AiJobLease lease, TaskMessageDTO taskMessage, AiNodeResult result) {
        AiTaskEventOutbox event = persistenceService.recordSuccess(job, lease, taskMessage, result);
        publisher.publish(event);
    }

    public void recordFailure(AiJob job, AiJobLease lease, TaskMessageDTO taskMessage, String error) {
        recordFailure(job, lease, taskMessage, null, error);
    }

    public void recordFailure(AiJob job, AiJobLease lease, TaskMessageDTO taskMessage,
                              AiNodeResult result, String error) {
        AiTaskEventOutbox event = persistenceService.recordFailure(job, lease, taskMessage, result, error);
        publisher.publish(event);
    }

    public int publishPending(AiJob job) {
        return publisher.publishPendingForJob(job);
    }
}
