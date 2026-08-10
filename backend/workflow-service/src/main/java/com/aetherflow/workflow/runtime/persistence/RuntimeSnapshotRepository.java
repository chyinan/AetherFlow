package com.aetherflow.workflow.runtime.persistence;

import java.util.List;
import java.util.Optional;

public interface RuntimeSnapshotRepository {

    void save(WorkflowRuntimeSnapshot snapshot);

    Optional<WorkflowRuntimeSnapshot> findByWorkflowId(String workflowId);

    List<WorkflowRuntimeSnapshot> findRecoverable(int limit);

    default List<WorkflowRuntimeSnapshot> findTerminal(int limit) {
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
