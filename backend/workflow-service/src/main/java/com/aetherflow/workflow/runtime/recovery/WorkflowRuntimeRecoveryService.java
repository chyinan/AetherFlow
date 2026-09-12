package com.aetherflow.workflow.runtime.recovery;

// pattern: Imperative Shell

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.notification.WorkflowTerminalNotificationOutboxService;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import org.springframework.beans.factory.annotation.Autowired;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.time.Instant;

@Service
@Slf4j
// pattern: Imperative Shell
public class WorkflowRuntimeRecoveryService {

    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowRuntimeEngine runtimeEngine;
    private final WorkflowRuntimeProperties runtimeProperties;
    private final WorkflowInstanceMapper instanceMapper;
    private final WorkflowTerminalNotificationOutboxService terminalNotificationOutboxService;

    public WorkflowRuntimeRecoveryService(RuntimeSnapshotRepository snapshotRepository,
                                          WorkflowRuntimeEngine runtimeEngine,
                                          WorkflowRuntimeProperties runtimeProperties) {
        this(snapshotRepository, runtimeEngine, runtimeProperties, null, null);
    }

    public WorkflowRuntimeRecoveryService(RuntimeSnapshotRepository snapshotRepository,
                                          WorkflowRuntimeEngine runtimeEngine,
                                          WorkflowRuntimeProperties runtimeProperties,
                                          WorkflowInstanceMapper instanceMapper) {
        this(snapshotRepository, runtimeEngine, runtimeProperties, instanceMapper, null);
    }

    @Autowired
    public WorkflowRuntimeRecoveryService(RuntimeSnapshotRepository snapshotRepository,
                                          WorkflowRuntimeEngine runtimeEngine,
                                          WorkflowRuntimeProperties runtimeProperties,
                                          WorkflowInstanceMapper instanceMapper,
                                          WorkflowTerminalNotificationOutboxService terminalNotificationOutboxService) {
        this.snapshotRepository = snapshotRepository;
        this.runtimeEngine = runtimeEngine;
        this.runtimeProperties = runtimeProperties;
        this.instanceMapper = instanceMapper;
        this.terminalNotificationOutboxService = terminalNotificationOutboxService;
    }

    public List<WorkflowExecutionSnapshot> recoverRunnableWorkflows() {
        return recoverRunnableWorkflows(100);
    }

    public List<WorkflowExecutionSnapshot> recoverRunnableWorkflows(int limit) {
        return recoverRunnableWorkflows(limit, null);
    }

    public List<WorkflowExecutionSnapshot> recoverRunnableWorkflows(int limit, Instant before) {
        List<WorkflowExecutionSnapshot> recovered = new java.util.ArrayList<>();
        for (WorkflowRuntimeSnapshot snapshot : before == null
                ? snapshotRepository.findRecoverable(limit)
                : snapshotRepository.findRecoverable(limit, before)) {
            try {
                recovered.add(recover(snapshot));
            } catch (RuntimeException exception) {
                log.error("workflow runtime recovery skipped corrupted snapshot, workflowId={}, reason={}",
                        snapshot == null ? null : snapshot.workflowId(), exception.getMessage(), exception);
            }
        }
        return List.copyOf(recovered);
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
        Long userId = userId(recoverySnapshot.variables());
        WorkflowExecutionSnapshot recovered = AuthenticatedUserContext.runAs(userId, username(recoverySnapshot.variables()),
                () -> runtimeEngine.resume(request, recoverySnapshot.toExecutionSnapshot()));
        return recovered;
    }

    private Long userId(java.util.Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("userId");
        if (value instanceof Number number && number.longValue() > 0) {
            return number.longValue();
        }
        if (value != null) {
            try {
                long parsed = Long.parseLong(String.valueOf(value));
                if (parsed > 0) {
                    return parsed;
                }
            } catch (NumberFormatException ignored) {
                // Fall through to the explicit authentication error.
            }
        }
        throw new com.aetherflow.common.exception.BusinessException(
                com.aetherflow.common.core.ResultCode.UNAUTHORIZED,
                "authenticated user is required for workflow recovery");
    }

    private String username(java.util.Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("username");
        return value == null || String.valueOf(value).isBlank() ? "aether.operator" : String.valueOf(value).trim();
    }

    public int reconcileTerminalWorkflows(int limit) {
        if (instanceMapper == null) {
            return 0;
        }
        int reconciled = 0;
        for (WorkflowRuntimeSnapshot snapshot : snapshotRepository.findTerminalNeedingReconciliation(limit)) {
            try {
                Long instanceId = Long.valueOf(snapshot.workflowId());
                java.time.LocalDateTime now = java.time.LocalDateTime.now();
                int updated = instanceMapper.transitionRuntimeState(
                        instanceId,
                        snapshot.runtimeState().name(),
                        snapshot.toExecutionSnapshot().currentNodeId(),
                        now,
                        now);
                if (terminalNotificationOutboxService != null) {
                    terminalNotificationOutboxService.enqueue(
                            instanceId,
                            userId(snapshot.variables()),
                            snapshot.traceId(),
                            snapshot.runtimeState(),
                            snapshot.toExecutionSnapshot().currentNodeId());
                }
                if (updated == 1 || terminalNotificationOutboxService != null) {
                    reconciled++;
                }
            } catch (NumberFormatException ignored) {
                // Non-database workflow ids are used by in-memory and test runtimes.
            }
        }
        return reconciled;
    }

}
