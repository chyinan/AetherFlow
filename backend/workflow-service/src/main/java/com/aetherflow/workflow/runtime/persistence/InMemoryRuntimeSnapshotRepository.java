package com.aetherflow.workflow.runtime.persistence;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class InMemoryRuntimeSnapshotRepository implements RuntimeSnapshotRepository {

    private final ConcurrentMap<String, WorkflowRuntimeSnapshot> snapshots = new ConcurrentHashMap<>();

    @Override
    public void save(WorkflowRuntimeSnapshot snapshot) {
        if (snapshot != null) {
            snapshots.put(snapshot.workflowId(), snapshot);
        }
    }

    @Override
    public Optional<WorkflowRuntimeSnapshot> findByWorkflowId(String workflowId) {
        return Optional.ofNullable(snapshots.get(workflowId));
    }

    @Override
    public List<WorkflowRuntimeSnapshot> findRecoverable(int limit) {
        int maxResults = Math.max(1, limit);
        return snapshots.values().stream()
                .filter(WorkflowRuntimeSnapshot::recoverable)
                .sorted(Comparator.comparing(WorkflowRuntimeSnapshot::updatedAt))
                .limit(maxResults)
                .toList();
    }
}
