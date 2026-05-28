package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkflowRuntimeEngineTest {

    @Test
    void executesSequentialDagUsingRegisteredNodeExecutors() {
        List<String> executed = new ArrayList<>();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("INPUT", executed, context -> NodeResult.success(
                        Map.of("file", context.variables().get("file")),
                        Map.of("text", "transcribed")
                )),
                executor("SUMMARY", executed, context -> {
                    assertThat(context.variables()).containsEntry("text", "transcribed");
                    assertThat(context.nodeOutputs()).containsKey("node-input");
                    return NodeResult.success(Map.of("summary", "done"));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-1",
                "trace-1",
                "task-1",
                definition(
                        node("node-input", "INPUT", Map.of()),
                        node("node-summary", "SUMMARY", Map.of())
                ),
                Map.of("file", "audio.mp3"),
                RetryPolicy.none()
        ));

        assertThat(executed).containsExactly("INPUT", "SUMMARY");
        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshot.currentNodeId()).isEqualTo("node-summary");
        assertThat(snapshot.variables()).containsEntry("text", "transcribed");
        assertThat(snapshot.nodeOutputs()).containsKeys("node-input", "node-summary");
    }

    @Test
    void followsConditionBranchReturnedByNodeResult() {
        List<String> executed = new ArrayList<>();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("CONDITION", executed, context -> NodeResult.success(Map.of("decision", "approved"))
                        .withBranchKey("approved")),
                executor("EXPORT", executed, context -> NodeResult.success(Map.of("exported", true))),
                executor("NOTIFY", executed, context -> NodeResult.success(Map.of("notified", true)))
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-2",
                "trace-2",
                "task-2",
                definition(
                        node("node-condition", "CONDITION", Map.of(
                                "branches", Map.of(
                                        "approved", "node-export",
                                        "rejected", "node-notify"
                                )
                        )),
                        node("node-export", "EXPORT", Map.of()),
                        node("node-notify", "NOTIFY", Map.of())
                ),
                Map.of(),
                RetryPolicy.none()
        ));

        assertThat(executed).containsExactly("CONDITION", "EXPORT");
        assertThat(snapshot.nodeOutputs()).containsKeys("node-condition", "node-export");
        assertThat(snapshot.nodeOutputs()).doesNotContainKey("node-notify");
    }

    @Test
    void failsWhenNodeExecutorIsMissing() {
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of()));

        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "workflow-3",
                "trace-3",
                "task-3",
                definition(node("node-missing", "WHISPER", Map.of())),
                Map.of(),
                RetryPolicy.none()
        );

        assertThatThrownBy(() -> engine.execute(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("WHISPER");
    }

    @Test
    void retriesNodeExceptionsAndPublishesRetryEvents() {
        AtomicInteger attempts = new AtomicInteger();
        RecordingRuntimeEventPublisher publisher = new RecordingRuntimeEventPublisher();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("UNSTABLE", new ArrayList<>(), context -> {
                    int attempt = attempts.incrementAndGet();
                    if (attempt < 3) {
                        throw new IllegalStateException("temporary failure");
                    }
                    return NodeResult.success(Map.of("attempt", attempt));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry,
                new RuntimeStateMachine(),
                publisher,
                RuntimeSleeper.noop()
        );

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-4",
                "trace-4",
                "task-4",
                definition(node("node-unstable", "UNSTABLE", Map.of())),
                Map.of(),
                RetryPolicy.of(3, Duration.ZERO, 1.0D, Duration.ZERO)
        ));

        assertThat(attempts).hasValue(3);
        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(publisher.events())
                .extracting(RuntimeEvent::eventType)
                .contains(
                        RuntimeEventType.WORKFLOW_STARTED,
                        RuntimeEventType.NODE_STARTED,
                        RuntimeEventType.NODE_RETRYING,
                        RuntimeEventType.NODE_COMPLETED,
                        RuntimeEventType.WORKFLOW_COMPLETED
                );
        assertThat(publisher.events().stream()
                .filter(event -> event.eventType() == RuntimeEventType.NODE_RETRYING))
                .hasSize(2);
    }

    private static NodeExecutor executor(String type,
                                         List<String> executed,
                                         NodeBehavior behavior) {
        return new NodeExecutor() {
            @Override
            public NodeType nodeType() {
                return NodeType.of(type);
            }

            @Override
            public NodeResult execute(WorkflowContext context) throws Exception {
                executed.add(type);
                return behavior.execute(context);
            }
        };
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("runtime-test");
        definition.setNodes(List.of(nodes));
        return definition;
    }

    private static WorkflowNodeDTO node(String nodeId, String nodeType, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(nodeId);
        node.setNodeType(nodeType);
        node.setDisplayName(nodeId);
        node.setConfig(config);
        return node;
    }

    @FunctionalInterface
    private interface NodeBehavior {
        NodeResult execute(WorkflowContext context) throws Exception;
    }

    private static final class RecordingRuntimeEventPublisher implements RuntimeEventPublisher {

        private final List<RuntimeEvent> events = new ArrayList<>();

        @Override
        public void publish(RuntimeEvent event) {
            events.add(event);
        }

        List<RuntimeEvent> events() {
            return events;
        }
    }
}
