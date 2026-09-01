package com.aetherflow.workflow.runtime.persistence;

import java.util.List;
import java.util.Optional;
import java.time.Instant;

// pattern: Imperative Shell
public interface RuntimeSnapshotRepository {

    void save(WorkflowRuntimeSnapshot snapshot);

    /** Claims the durable snapshot row for the currently held distributed lease. */
    default void claimForLease(String workflowId, String fencingToken) {
    }

    /** Saves only when the caller still owns the durable fencing token. */
    default void save(WorkflowRuntimeSnapshot snapshot, String fencingToken) {
        save(snapshot);
    }

    Optional<WorkflowRuntimeSnapshot> findByWorkflowId(String workflowId);

    List<WorkflowRuntimeSnapshot> findRecoverable(int limit);

    default List<WorkflowRuntimeSnapshot> findRecoverable(int limit, Instant before) {
        return findRecoverable(limit);
    }

    default List<WorkflowRuntimeSnapshot> findTerminal(int limit) {
        return List.of();
    }

    default List<WorkflowRuntimeSnapshot> findWaiting(int limit, Instant before) {
        return List.of();
    }

    static RuntimeSnapshotRepository noop() {
        return NoopRuntimeSnapshotRepository.INSTANCE;
    }

    final class NoopRuntimeSnapshotRepository implements RuntimeSnapshotRepository {

        private static final NoopRuntimeSnapshotRepository INSTANCE = new NoopRuntimeSnapshotRepository();

        private NoopRuntimeSnapshotRepository() {
        }

        @Override
        public void save(WorkflowRuntimeSnapshot snapshot) {
        }

        @Override
        public Optional<WorkflowRuntimeSnapshot> findByWorkflowId(String workflowId) {
            return Optional.empty();
        }

        @Override
        public List<WorkflowRuntimeSnapshot> findRecoverable(int limit) {
            return List.of();
        }
    }
}
