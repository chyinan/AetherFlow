package com.aetherflow.workflow.runtime.recovery;

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkflowRuntimeRecoveryService {

    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowRuntimeEngine runtimeEngine;
    private final WorkflowRuntimeProperties runtimeProperties;

    public List<WorkflowExecutionSnapshot> recoverRunnableWorkflows() {
        return recoverRunnableWorkflows(100);
    }

    public List<WorkflowExecutionSnapshot> recoverRunnableWorkflows(int limit) {
        return snapshotRepository.findRecoverable(limit).stream()
                .map(this::recover)
                .toList();
    }

    public WorkflowExecutionSnapshot recover(WorkflowRuntimeSnapshot snapshot) {
        WorkflowRuntimeSnapshot recoverySnapshot = snapshot;
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                recoverySnapshot.workflowId(),
                recoverySnapshot.traceId(),
                recoverySnapshot.taskId(),
                recoverySnapshot.definition(),
                recoverySnapshot.variables(),
                runtimeProperties.getRetry().toRetryPolicy()
        );
        WorkflowExecutionSnapshot recovered = runtimeEngine.resume(request, recoverySnapshot.toExecutionSnapshot());
        snapshotRepository.save(WorkflowRuntimeSnapshot.fromExecution(
                recoverySnapshot.workflowId(),
                recoverySnapshot.traceId(),
                recoverySnapshot.taskId(),
                recoverySnapshot.definitionId(),
                recoverySnapshot.definition(),
                recovered,
                recovered.currentNodeIds(),
                recovered.failedNodeIds()
        ));
        return recovered;
    }
}
