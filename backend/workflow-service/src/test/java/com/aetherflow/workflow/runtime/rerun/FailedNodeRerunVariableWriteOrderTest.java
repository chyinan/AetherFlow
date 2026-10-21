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
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 同名变量由多个节点写入时，局部重跑必须沿用原运行的真实写入顺序，
 * 不能按深度与节点 ID 重建出另一份最终值。
 */
class FailedNodeRerunVariableWriteOrderTest {

    @Test
    void reusesVariablesInTheOriginalCompletionOrderSoTheLastWriterWins() {
        WorkflowRuntimeSnapshot source = source();

        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "d");
        assertThat(plan.eligible()).isTrue();
        assertThat(plan.preservedNodeIds()).containsExactly("start", "a", "z");

        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());

        // 原运行里 z 最后写入 completion，重跑必须继续看到 z 的值。
        assertThat(seed.variables()).containsEntry("completion", "B");
    }

    @Test
    void theRerunOfTheDownstreamNodeStillSeesTheOriginalValue() {
        WorkflowRuntimeSnapshot source = source();
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "d");
        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(seed);
        List<RuntimeEvent> events = new CopyOnWriteArrayList<>();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(
                executor("A", context -> NodeResult.success(Map.of("completion", "A"), Map.of("completion", "A"))),
                executor("Z", context -> NodeResult.success(Map.of("completion", "B"), Map.of("completion", "B"))),
                executor("D", context -> {
                    // 下游必须读到原运行里的值，否则重跑结果与原运行不可比。
                    assertThat(context.variables()).containsEntry("completion", "B");
                    return NodeResult.success(Map.of("final", "done"));
                }))), new RuntimeStateMachine(), events::add, duration -> {}, repository);

        var result = engine.resume(new WorkflowRuntimeRequest(seed.workflowId(), seed.traceId(), seed.taskId(),
                seed.definition(), seed.variables(), RetryPolicy.none()), seed.toExecutionSnapshot());

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        // 上游已完成节点不重复执行。
        assertThat(events.stream().filter(event -> Boolean.TRUE.equals(event.attributes().get("reused"))).map(RuntimeEvent::nodeId))
                .containsExactly("start", "a", "z");
    }

    /** start 并行启动 a 与 z；a 先写入 completion=A，z 后写入 completion=B；d 使用该变量后失败。 */
    private static WorkflowRuntimeSnapshot source() {
        WorkflowDefinitionDTO definition = definition(
                node("start", "START", Map.of("nextNodes", List.of("a", "z"))),
                node("a", "A", Map.of("next", "d")),
                node("z", "Z", Map.of("next", "d")),
                node("d", "D", Map.of()));
        return new WorkflowRuntimeSnapshot("1", "trace-1", "1", 10L, definition, RuntimeState.FAILED,
                List.of(), List.of("start", "a", "z", "d"), List.of("d"),
                Map.of("completion", "B"),
                Map.of("start", NodeResult.success(Map.of()),
                        "a", NodeResult.success(Map.of("completion", "A"), Map.of("completion", "A")),
                        "z", NodeResult.success(Map.of("completion", "B"), Map.of("completion", "B")),
                        "d", NodeResult.success(Map.of("completion", "B"))),
                Instant.parse("2026-10-20T01:00:00Z"));
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
