package com.aetherflow.workflow.runtime.recovery;

// pattern: Imperative Shell

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 持续恢复运行中断的工作流，避免只依赖服务启动时的一次性扫描。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowRuntimeRecoveryJob {

    private final WorkflowRuntimeRecoveryService recoveryService;
    private final WorkflowRuntimeProperties properties;

    @Scheduled(fixedDelayString = "${aetherflow.workflow.runtime.recovery.interval:10000}")
    public void recoverDueWorkflows() {
        WorkflowRuntimeProperties.Recovery recovery = properties.getRecovery();
        if (!recovery.isEnabled()) {
            return;
        }
        try {
            java.time.Duration staleAfter = recovery.getStaleAfter();
            java.time.Instant recoverBefore = staleAfter == null || staleAfter.isNegative() || staleAfter.isZero()
                    ? null : java.time.Instant.now().minus(staleAfter);
            int recovered = recoveryService.recoverRunnableWorkflows(recovery.getScanLimit(), recoverBefore).size();
            int reconciled = recoveryService.reconcileTerminalWorkflows(recovery.getScanLimit());
            if (recovered > 0 || reconciled > 0) {
                log.info("workflow runtime recovery tick completed, recoveredCount={}, reconciledCount={}",
                        recovered, reconciled);
            }
        } catch (RuntimeException exception) {
            log.warn("workflow runtime recovery tick failed; next tick will retry, reason={}",
                    exception.getMessage(), exception);
        }
    }
}
