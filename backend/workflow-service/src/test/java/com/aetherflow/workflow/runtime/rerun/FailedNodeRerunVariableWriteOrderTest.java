package com.aetherflow.workflow.runtime.rerun;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.runtime.engine.RuntimeSleeper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 从真实引擎生成的失败快照验证局部重跑仍使用正常执行的变量优先级。
 */
class FailedNodeRerunVariableWriteOrderTest {

    @Test
    void reconstructsTheSameVariableWinnerAsTheOriginalEngineRun() {
        WorkflowRuntimeSnapshot source = source();
        assertThat(source.runtimeState()).isEqualTo(RuntimeState.FAILED);
        assertThat(source.completedNodeIds()).containsExactly("start", "a", "z");
        assertThat(source.variables()).containsEntry("completion", "A");

        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "d");
        assertThat(plan.eligible()).isTrue();
        assertThat(plan.preservedNodeIds()).containsExactly("start", "a", "z");

        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());

        assertThat(seed.variables()).containsEntry("completion", "A");
    }

    @Test
    void theRerunOfTheDownstreamNodeStillSeesTheOriginalValue() {
        WorkflowRuntimeSnapshot source = source();
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "d");
        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(seed);
        List<RuntimeEvent> events = new CopyOnWriteArrayList<>();
        AtomicInteger downstreamCalls = new AtomicInteger();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(
                executor("START", context -> { throw new AssertionError("已完成起点不能重复执行"); }),
                executor("A", context -> { throw new AssertionError("已完成节点 a 不能重复执行"); }),
                executor("Z", context -> { throw new AssertionError("已完成节点 z 不能重复执行"); }),
                executor("D", context -> {
                    downstreamCalls.incrementAndGet();
                    assertThat(context.variables()).containsEntry("completion", "A");
                    return NodeResult.success(Map.of("final", "done"));
                }))), new RuntimeStateMachine(), events::add, duration -> {}, repository);

        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(seed.workflowId(), seed.traceId(), seed.taskId(),
                seed.definition(), seed.variables(), RetryPolicy.none());
        var result = engine.resume(request, seed.toExecutionSnapshot());
        var duplicate = engine.resume(request, seed.toExecutionSnapshot());

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(duplicate.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(downstreamCalls).hasValue(1);
        // 上游已完成节点不重复执行。
        assertThat(events.stream().filter(event -> Boolean.TRUE.equals(event.attributes().get("reused"))).map(RuntimeEvent::nodeId))
                .containsExactly("start", "a", "z");
    }

    /** start 并行启动 a 与 z；运行事件门控使 a 先完成，z 后完成；同深度时正常引擎仍选择 ID 更小的 a。 */
    private static WorkflowRuntimeSnapshot source() {
        WorkflowDefinitionDTO definition = definition(
                node("start", "START", Map.of("nextNodes", List.of("a", "z"))),
                node("a", "A", Map.of("next", "d")),
                node("z", "Z", Map.of("next", "d")),
                node("d", "D", Map.of()));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        CountDownLatch aCompleted = new CountDownLatch(1);
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("A", context -> NodeResult.success(Map.of("completion", "A"), Map.of("completion", "A"))),
                executor("Z", context -> {
                    try {
                        if (!aCompleted.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("节点 a 未完成");
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException("等待节点 a 完成时被中断", exception);
                    }
                    return NodeResult.success(Map.of("completion", "B"), Map.of("completion", "B"));
                }),
                executor("D", context -> {
                    assertThat(context.variables()).containsEntry("completion", "A");
                    throw new IllegalStateException("故意失败以生成可重跑的运行快照");
                }))), new RuntimeStateMachine(), event -> {
            if (event.eventType() == com.aetherflow.workflow.runtime.api.RuntimeEventType.NODE_COMPLETED
                    && "a".equals(event.nodeId())) aCompleted.countDown();
        }, RuntimeSleeper.noop(), repository);
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest("1", "trace-1", "1", definition, Map.of(), RetryPolicy.none());
        try {
            engine.execute(request);
            throw new AssertionError("源工作流应在节点 d 失败");
        } catch (IllegalStateException expected) {
            assertThat(expected).hasMessageContaining("故意失败");
        }
        return repository.findByWorkflowId("1").orElseThrow();
    }

    /**
     * A09：异步回调的到达顺序不得改变最终变量，否则失败节点重跑的输入会与原运行不一致。
     * start 并行放出 a 与 z（两者都异步等待、都写同名变量 completion），a 先完成、z 后完成；
     * 同深度下 ID 更小的 a 胜出，重跑 d 必须看到与原运行逐字段一致的输入。
     */
    @Test
    void asyncCompletionOrderDoesNotChangeTheVariableInputOfTheRerun() {
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        List<Map<String, Object>> observedInputs = new CopyOnWriteArrayList<>();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("A", context -> NodeResult.waiting(Map.of("externalTaskId", 1L))),
                executor("Z", context -> NodeResult.waiting(Map.of("externalTaskId", 2L))),
                executor("D", context -> {
                    observedInputs.add(Map.copyOf(context.variables()));
                    throw new IllegalStateException("故意失败以生成可重跑的运行快照");
                }))), new RuntimeStateMachine(), event -> {}, RuntimeSleeper.noop(), repository);
        WorkflowDefinitionDTO definition = definition(
                node("start", "START", Map.of("nextNodes", List.of("a", "z"))),
                node("a", "A", Map.of("next", "d")),
                node("z", "Z", Map.of("next", "d")),
                node("d", "D", Map.of()));
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "8001", "trace-8001", "8001", definition, Map.of(), RetryPolicy.none());

        WorkflowExecutionSnapshot waiting = engine.execute(request);
        assertThat(waiting.runtimeState()).isEqualTo(RuntimeState.WAITING);
        WorkflowExecutionSnapshot afterA = engine.completeWaitingNode(
                request, waiting, "a", NodeResult.success(Map.of(), Map.of("completion", "A")));
        assertThatThrownBy(() -> engine.completeWaitingNode(
                request, afterA, "z", NodeResult.success(Map.of(), Map.of("completion", "Z"))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("故意失败");

        WorkflowRuntimeSnapshot source = repository.findByWorkflowId("8001").orElseThrow();
        assertThat(source.runtimeState()).isEqualTo(RuntimeState.FAILED);
        assertThat(source.failedNodeIds()).containsExactly("d");
        assertThat(source.variables()).containsEntry("completion", "A");
        assertThat(observedInputs).hasSize(1);
        Map<String, Object> originalInput = observedInputs.get(0);
        assertThat(originalInput).containsEntry("completion", "A");

        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "d");
        assertThat(plan.eligible()).isTrue();
        assertThat(plan.preservedNodeIds()).containsExactly("start", "a", "z");
        WorkflowRuntimeSnapshot seed = plan.seed(source, "8002", "trace-8002", Map.of());
        assertThat(seed.variables()).containsEntry("completion", "A");

        InMemoryRuntimeSnapshotRepository rerunRepository = new InMemoryRuntimeSnapshotRepository();
        rerunRepository.save(seed);
        List<Map<String, Object>> rerunInputs = new CopyOnWriteArrayList<>();
        WorkflowRuntimeEngine rerunEngine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(
                executor("START", context -> { throw new AssertionError("已完成起点不能重复执行"); }),
                executor("A", context -> { throw new AssertionError("已完成节点 a 不能重复执行"); }),
                executor("Z", context -> { throw new AssertionError("已完成节点 z 不能重复执行"); }),
                executor("D", context -> {
                    rerunInputs.add(Map.copyOf(context.variables()));
                    return NodeResult.success(Map.of("final", "done"));
                }))), new RuntimeStateMachine(), event -> {}, RuntimeSleeper.noop(), rerunRepository);
        WorkflowRuntimeRequest rerunRequest = new WorkflowRuntimeRequest(
                seed.workflowId(), seed.traceId(), seed.taskId(), seed.definition(), seed.variables(),
                RetryPolicy.none());
        var rerunResult = rerunEngine.resume(rerunRequest, seed.toExecutionSnapshot());

        assertThat(rerunResult.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(rerunInputs).hasSize(1);
        assertThat(rerunInputs.get(0)).isEqualTo(originalInput);
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

    private static NodeExecutor executor(String type, Function<WorkflowContext, NodeResult> behavior) {
        return new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of(type); }
            public NodeResult execute(WorkflowContext context) { return behavior.apply(context); }
        };
    }
}
