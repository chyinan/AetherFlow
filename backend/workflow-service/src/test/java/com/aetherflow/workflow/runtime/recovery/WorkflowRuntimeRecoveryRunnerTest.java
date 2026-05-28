package com.aetherflow.workflow.runtime.recovery;

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class WorkflowRuntimeRecoveryRunnerTest {

    @Test
    void recoversRunnableWorkflowsOnStartupWhenEnabled() {
        WorkflowRuntimeRecoveryService recoveryService = mock(WorkflowRuntimeRecoveryService.class);
        WorkflowRuntimeProperties properties = new WorkflowRuntimeProperties();
        properties.getRecovery().setEnabled(true);
        properties.getRecovery().setScanLimit(25);
        WorkflowRuntimeRecoveryRunner runner = new WorkflowRuntimeRecoveryRunner(recoveryService, properties);

        runner.run(null);

        verify(recoveryService).recoverRunnableWorkflows(25);
    }

    @Test
    void skipsStartupRecoveryWhenDisabled() {
        WorkflowRuntimeRecoveryService recoveryService = mock(WorkflowRuntimeRecoveryService.class);
        WorkflowRuntimeProperties properties = new WorkflowRuntimeProperties();
        properties.getRecovery().setEnabled(false);
        WorkflowRuntimeRecoveryRunner runner = new WorkflowRuntimeRecoveryRunner(recoveryService, properties);

        runner.run(null);

        verify(recoveryService, never()).recoverRunnableWorkflows(100);
    }
}
