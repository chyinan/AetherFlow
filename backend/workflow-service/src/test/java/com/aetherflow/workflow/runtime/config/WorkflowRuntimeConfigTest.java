package com.aetherflow.workflow.runtime.config;

import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.event.PersistentRuntimeEventPublisher;
import com.aetherflow.workflow.runtime.event.RabbitRuntimeEventPublisher;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowRuntimeConfigTest {

    @Test
    void createsNodeRegistryFromSpringDiscoveredExecutors() {
        WorkflowRuntimeConfig config = new WorkflowRuntimeConfig();
        StubExecutor executor = new StubExecutor();

        NodeRegistry registry = config.nodeRegistry(List.of(executor));

        assertThat(registry.getRequired(NodeType.of("TEST_NODE"))).isSameAs(executor);
    }

    @Test
    void runtimePublisherIncludesPersistentEventStore() {
        WorkflowRuntimeConfig config = new WorkflowRuntimeConfig();
        RecordingRuntimeEventStore eventStore = new RecordingRuntimeEventStore();
        PersistentRuntimeEventPublisher persistentPublisher = config.persistentRuntimeEventPublisher(eventStore);
        RuntimeEventPublisher publisher = config.runtimeEventPublisher(
                new WorkflowRuntimeMetrics(),
                new InMemoryRuntimeObservationStore(),
                persistentPublisher,
                new RabbitRuntimeEventPublisher(null, new WorkflowRuntimeProperties())
        );
        RuntimeEvent event = RuntimeEvent.of(RuntimeEventType.WORKFLOW_STARTED,
                "workflow-1", "trace-1", "task-1", null, RuntimeState.RUNNING,
                Instant.parse("2026-05-28T12:00:00Z"), Map.of("totalNodes", 1));

        publisher.publish(event);

        assertThat(eventStore.findByWorkflowId("workflow-1")).containsExactly(event);
    }

    private static final class StubExecutor implements NodeExecutor {

        @Override
        public NodeType nodeType() {
            return NodeType.of("TEST_NODE");
        }

        @Override
        public NodeResult execute(WorkflowContext context) {
            return NodeResult.success(Map.of());
        }
    }

    private static final class RecordingRuntimeEventStore implements RuntimeEventStore {

        private final List<RuntimeEvent> events = new ArrayList<>();

        @Override
        public void append(RuntimeEvent event) {
            events.add(event);
        }

        @Override
        public List<RuntimeEvent> findByWorkflowId(String workflowId) {
            return events.stream()
                    .filter(event -> event.workflowId().equals(workflowId))
                    .toList();
        }
    }
}
