package com.aetherflow.workflow.runtime.recovery;

// pattern: Imperative Shell

import com.aetherflow.workflow.service.impl.WorkflowServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowStartRecoveryJob {

    private final WorkflowServiceImpl workflowService;

    @Scheduled(fixedDelayString = "${aetherflow.workflow.start-outbox-interval-millis:5000}")
    public void dispatchDueWorkflowStarts() {
        int dispatched = workflowService.dispatchPendingStarts();
        if (dispatched > 0) {
            log.info("workflow start outbox dispatched count={}", dispatched);
        }
    }
}
