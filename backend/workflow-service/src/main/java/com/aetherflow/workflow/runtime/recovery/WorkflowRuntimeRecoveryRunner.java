package com.aetherflow.workflow.runtime.recovery;

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowRuntimeRecoveryRunner implements ApplicationRunner {

    private final WorkflowRuntimeRecoveryService recoveryService;
    private final WorkflowRuntimeProperties properties;

    @Override
    public void run(ApplicationArguments args) {
        WorkflowRuntimeProperties.Recovery recovery = properties.getRecovery();
        if (!recovery.isEnabled()) {
            log.info("workflow runtime recovery skipped because it is disabled");
            return;
        }
        try {
            int recoveredCount = recoveryService.recoverRunnableWorkflows(recovery.getScanLimit()).size();
            log.info("workflow runtime recovery finished, recoveredCount={}", recoveredCount);
        } catch (RuntimeException exception) {
            log.warn("workflow runtime recovery failed during startup, reason={}", exception.getMessage());
        }
    }
}
