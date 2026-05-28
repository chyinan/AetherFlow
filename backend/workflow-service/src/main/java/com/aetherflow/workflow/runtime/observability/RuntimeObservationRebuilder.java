package com.aetherflow.workflow.runtime.observability;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;

import java.util.List;
import java.util.Optional;

public final class RuntimeObservationRebuilder {

    private RuntimeObservationRebuilder() {
    }

    public static Optional<WorkflowRuntimeObservation> rebuild(String workflowId, List<RuntimeEvent> events) {
        if (workflowId == null || workflowId.isBlank() || events == null || events.isEmpty()) {
            return Optional.empty();
        }
        InMemoryRuntimeObservationStore store = new InMemoryRuntimeObservationStore(Math.max(1, events.size()));
        events.stream()
                .filter(event -> workflowId.equals(event.workflowId()))
                .forEach(store::publish);
        return store.snapshot(workflowId);
    }
}
