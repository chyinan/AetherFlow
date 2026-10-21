package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 并行执行时失败必须归属到真正失败的节点，
 * 不能被最后执行的成功节点抢走失败身份。
 */
class WorkflowRuntimeEngineFailureAttributionTest {

    @Test
    void parallelFailureIsAttributedToTheFailingNodeInsteadOfTheSucceededOne() throws Exception {
        CountDownLatch bSucceeded = new CountDownLatch(1);
        CountDownLatch aStarted = new CountDownLatch(1);
        List<RuntimeEvent> events = new ArrayList<>();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of("started", true))),
                executor("PARALLEL", context -> {
                    String nodeId = context.currentNodeId();
                    if ("node-a".equals(nodeId)) {
                        aStarted.countDown();
                        // A 等 B 成功后再失败，形成确定的完成顺序。
                        await(bSucceeded);
                        throw new IllegalStateException("A 失败");
                    }
                    bSucceeded.countDown();
                    return NodeResult.success(Map.of("b", "done"));
                })
        ));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry, new RuntimeStateMachine(), events::add, RuntimeSleeper.threadSleep(),
                repository, WorkflowRuntimeLock.noop(), workflowId -> false);
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "workflow-parallel", "trace-parallel", "task-parallel",
                definition(
                        node("start", "START", Map.of("nextNodes", List.of("node-a", "node-b"))),
                        node("node-a", "PARALLEL", Map.of()),
                        node("node-b", "PARALLEL", Map.of())
                ),
                Map.of(), RetryPolicy.none());

        assertThatThrownBy(() -> engine.execute(request)).hasMessage("A 失败");

        assertThat(aStarted.getCount()).isZero();
        List<RuntimeEvent> failures = events.stream()
                .filter(event -> event.eventType() == RuntimeEventType.WORKFLOW_FAILED)
                .toList();
        assertThat(failures).hasSize(1);
        // 失败事件必须指向真正失败的 A，而不是先完成的 B。
        assertThat(failures.get(0).nodeId()).isEqualTo("node-a");
        assertThat(failures.get(0).attributes()).containsEntry("error", "A 失败");
        assertThat(events.stream()
                .filter(event -> event.eventType() == RuntimeEventType.NODE_COMPLETED)
                .map(RuntimeEvent::nodeId)).contains("node-b").doesNotContain("node-a");
    }

    @Test
    void failedNodeIdStaysInTheDurableSnapshot() {
        CountDownLatch bSucceeded = new CountDownLatch(1);
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of("started", true))),
                executor("PARALLEL", context -> {
                    if ("node-a".equals(context.currentNodeId())) {
                        await(bSucceeded);
                        throw new IllegalStateException("A 失败");
                    }
                    bSucceeded.countDown();
                    return NodeResult.success(Map.of("b", "done"));
                })
        ));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry, new RuntimeStateMachine(), event -> {}, RuntimeSleeper.threadSleep(),
                repository, WorkflowRuntimeLock.noop(), workflowId -> false);
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "workflow-parallel", "trace-parallel", "task-parallel",
                definition(
                        node("start", "START", Map.of("nextNodes", List.of("node-a", "node-b"))),
                        node("node-a", "PARALLEL", Map.of()),
                        node("node-b", "PARALLEL", Map.of())
                ),
                Map.of(), RetryPolicy.none());

        assertThatThrownBy(() -> engine.execute(request)).hasMessage("A 失败");

        var snapshot = repository.findByWorkflowId("workflow-parallel").orElseThrow();
        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.FAILED);
        assertThat(snapshot.failedNodeIds()).contains("node-a");
        assertThat(snapshot.failedNodeIds()).doesNotContain("node-b");
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("等待超时", exception);
        }
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setNodes(List.of(nodes));
        return definition;
    }

    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setConfig(config);
        return node;
    }

    private static NodeExecutor executor(String type, java.util.function.Function<WorkflowContext, NodeResult> behavior) {
        return new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of(type); }
            public NodeResult execute(WorkflowContext context) { return behavior.apply(context); }
        };
    }
}
