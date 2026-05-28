package com.aetherflow.workflow.runtime.lock;

import java.time.Duration;
import java.util.Optional;

public interface WorkflowRuntimeLock {

    Optional<WorkflowRuntimeLockLease> acquire(String workflowId);

    boolean renew(WorkflowRuntimeLockLease lease);

    boolean release(WorkflowRuntimeLockLease lease);

    static WorkflowRuntimeLock noop() {
        return new WorkflowRuntimeLock() {
            @Override
            public Optional<WorkflowRuntimeLockLease> acquire(String workflowId) {
                return Optional.of(new WorkflowRuntimeLockLease(workflowId, "noop", Duration.ZERO));
            }

            @Override
            public boolean renew(WorkflowRuntimeLockLease lease) {
                return true;
            }

            @Override
            public boolean release(WorkflowRuntimeLockLease lease) {
                return true;
            }
        };
    }

    static WorkflowRuntimeLock alreadyHeld() {
        return new WorkflowRuntimeLock() {
            @Override
            public Optional<WorkflowRuntimeLockLease> acquire(String workflowId) {
                return Optional.empty();
            }

            @Override
            public boolean renew(WorkflowRuntimeLockLease lease) {
                return false;
            }

            @Override
            public boolean release(WorkflowRuntimeLockLease lease) {
                return false;
            }
        };
    }
}
