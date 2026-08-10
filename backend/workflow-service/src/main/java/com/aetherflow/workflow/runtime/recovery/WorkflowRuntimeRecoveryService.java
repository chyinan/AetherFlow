package com.aetherflow.workflow.runtime.recovery;

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkflowRuntimeRecoveryService {

    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowRuntimeEngine runtimeEngine;
    private final WorkflowRuntimeProperties runtimeProperties;
    private final WorkflowInstanceMapper instanceMapper;

    public WorkflowRuntimeRecoveryService(RuntimeSnapshotRepository snapshotRepository,
                                          WorkflowRuntimeEngine runtimeEngine,
                                          WorkflowRuntimeProperties runtimeProperties) {
        this(snapshotRepository, runtimeEngine, runtimeProperties, null);
    }

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
                recoverySnapshot.definitionId(),
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

    public int reconcileTerminalWorkflows(int limit) {
        if (instanceMapper == null) {
            return 0;
        }
        int reconciled = 0;
        for (WorkflowRuntimeSnapshot snapshot : snapshotRepository.findTerminal(limit)) {
            try {
                Long instanceId = Long.valueOf(snapshot.workflowId());
                WorkflowInstance update = new WorkflowInstance();
                update.setId(instanceId);
                update.setStatus(snapshot.runtimeState().name());
                update.setCurrentNodeId(snapshot.toExecutionSnapshot().currentNodeId());
                update.setUpdatedAt(java.time.LocalDateTime.now());
                update.setCompletedAt(java.time.LocalDateTime.now());
                instanceMapper.updateById(update);
                reconciled++;
            } catch (NumberFormatException ignored) {
                // Non-database workflow ids are used by in-memory and test runtimes.
            }
        }
        return reconciled;
    }
}
