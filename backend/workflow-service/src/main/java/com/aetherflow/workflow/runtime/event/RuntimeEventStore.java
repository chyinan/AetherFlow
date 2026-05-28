package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;

import java.util.Collections;
import java.util.List;

public interface RuntimeEventStore {

    void append(RuntimeEvent event);

    List<RuntimeEvent> findByWorkflowId(String workflowId);

    static RuntimeEventStore noop() {
        return new RuntimeEventStore() {
            @Override
            public void append(RuntimeEvent event) {
            }

            @Override
            public List<RuntimeEvent> findByWorkflowId(String workflowId) {
                return Collections.emptyList();
            }
        };
    }

    default List<RuntimeEvent> safeEvents(String workflowId) {
        if (workflowId == null || workflowId.isBlank()) {
            return List.of();
        }
        List<RuntimeEvent> events = findByWorkflowId(workflowId);
        return events == null ? List.of() : List.copyOf(events);
    }
}
