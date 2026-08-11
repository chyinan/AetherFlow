package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;

import java.util.Collections;
import java.util.List;

public interface RuntimeEventStore {

    void append(RuntimeEvent event);

    List<RuntimeEvent> findByWorkflowId(String workflowId);

    default boolean supportsIncrementalQuery() {
        return false;
    }

    default List<RuntimeEvent> findByWorkflowIdAfter(String workflowId, String eventId) {
        List<RuntimeEvent> events = safeEvents(workflowId);
        if (eventId == null || eventId.isBlank()) {
            return events;
        }
        for (int index = 0; index < events.size(); index++) {
            if (eventId.equals(events.get(index).eventId())) {
                return List.copyOf(events.subList(index + 1, events.size()));
            }
        }
        return events;
    }

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
