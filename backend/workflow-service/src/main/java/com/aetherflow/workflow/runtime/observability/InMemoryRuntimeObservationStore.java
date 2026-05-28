package com.aetherflow.workflow.runtime.observability;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.ConcurrentMap;

public class InMemoryRuntimeObservationStore implements RuntimeEventPublisher {

    private final int maxEventsPerWorkflow;
    private final ConcurrentMap<String, WorkflowRuntimeObservation> observations = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ConcurrentLinkedDeque<RuntimeEvent>> events = new ConcurrentHashMap<>();

    public InMemoryRuntimeObservationStore() {
        this(200);
    }

    public InMemoryRuntimeObservationStore(int maxEventsPerWorkflow) {
        this.maxEventsPerWorkflow = Math.max(1, maxEventsPerWorkflow);
    }

    @Override
    public void publish(RuntimeEvent event) {
        if (event == null) {
            return;
        }
        appendEvent(event);
        observations.compute(event.workflowId(), (workflowId, previous) -> nextObservation(event, previous));
    }

    public Optional<WorkflowRuntimeObservation> snapshot(String workflowId) {
        return Optional.ofNullable(observations.get(workflowId));
    }

    public List<RuntimeEvent> events(String workflowId) {
        ConcurrentLinkedDeque<RuntimeEvent> workflowEvents = events.get(workflowId);
        if (workflowEvents == null) {
            return List.of();
        }
        return List.copyOf(new ArrayList<>(workflowEvents));
    }

    private void appendEvent(RuntimeEvent event) {
        ConcurrentLinkedDeque<RuntimeEvent> workflowEvents = events.computeIfAbsent(
                event.workflowId(),
                ignored -> new ConcurrentLinkedDeque<>()
        );
        workflowEvents.addLast(event);
        while (workflowEvents.size() > maxEventsPerWorkflow) {
            workflowEvents.pollFirst();
        }
    }

    private WorkflowRuntimeObservation nextObservation(RuntimeEvent event, WorkflowRuntimeObservation previous) {
        int totalNodeCount = previous == null ? 0 : previous.totalNodeCount();
        int completedNodeCount = previous == null ? 0 : previous.completedNodeCount();
        String currentNodeId = previous == null ? null : previous.currentNodeId();

        Object totalNodes = event.attributes().get("totalNodes");
        if (totalNodes instanceof Number number) {
            totalNodeCount = number.intValue();
        }
        if (event.nodeId() != null && !event.nodeId().isBlank()) {
            currentNodeId = event.nodeId();
        }
        if (event.eventType() == RuntimeEventType.NODE_COMPLETED) {
            completedNodeCount++;
        }
        double progress = event.eventType() == RuntimeEventType.WORKFLOW_COMPLETED
                ? 1.0D
                : totalNodeCount <= 0 ? 0.0D : completedNodeCount / (double) totalNodeCount;
        return new WorkflowRuntimeObservation(
                event.workflowId(),
                event.traceId(),
                event.taskId(),
                event.runtimeState(),
                currentNodeId,
                completedNodeCount,
                totalNodeCount,
                progress
        );
    }
}
