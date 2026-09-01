package com.aetherflow.workflow.runtime.event;

// pattern: Imperative Shell

import com.aetherflow.workflow.runtime.api.RuntimeEvent;

import java.util.Collections;
import java.util.List;

public interface RuntimeEventStore {

    void append(RuntimeEvent event);

    List<RuntimeEvent> findByWorkflowId(String workflowId);

    default List<RuntimeEvent> findLatestByWorkflowId(String workflowId, int limit) {
        List<RuntimeEvent> events = findByWorkflowId(workflowId, limit);
        if (events == null || events.isEmpty()) {
            return List.of();
        }
        int start = Math.max(0, events.size() - Math.max(1, limit));
        return List.copyOf(events.subList(start, events.size()));
    }

    default List<RuntimeEvent> findByWorkflowId(String workflowId, int limit) {
        return bounded(safeEvents(workflowId), limit);
    }

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

    default List<RuntimeEvent> findByWorkflowIdAfter(String workflowId, String eventId, int limit) {
        return bounded(findByWorkflowIdAfter(workflowId, eventId), limit);
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

    private static List<RuntimeEvent> bounded(List<RuntimeEvent> events, int limit) {
        if (events == null || events.isEmpty() || limit <= 0) {
            return List.of();
        }
        return List.copyOf(events.subList(0, Math.min(events.size(), limit)));
    }
}
