package com.aetherflow.workflow.runtime.rerun;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeType;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 局部重跑必须按源运行真实完成顺序恢复分支跳过状态，与定义里的节点创建顺序无关。
 */
class FailedNodeRerunBranchSkipOrderTest {

    /** START → X；X 真分支 → C，假分支 → S；C 真分支 → F，假分支 → J；S → J；J → E；F → E。 */
    private static WorkflowDefinitionDTO definition(boolean conditionCreatedFirst) {
        WorkflowNodeDTO start = node("start", "START", Map.of("next", "x"));
        WorkflowNodeDTO condition = node("c", "CONDITION", Map.of("branches", Map.of("yes", "f", "no", "j")));
        WorkflowNodeDTO upstream = node("x", "CONDITION", Map.of("branches", Map.of("yes", "c", "no", "s")));
        WorkflowNodeDTO failed = node("f", "SERVICE", Map.of("next", "e"));
        WorkflowNodeDTO skippedService = node("s", "SERVICE", Map.of("next", "j"));
        WorkflowNodeDTO skippedMerge = node("j", "SERVICE", Map.of("next", "e"));
        WorkflowNodeDTO end = node("e", "END", Map.of());
        List<WorkflowNodeDTO> nodes = conditionCreatedFirst
                ? List.of(start, condition, upstream, failed, skippedService, skippedMerge, end)
                : List.of(start, upstream, condition, failed, skippedService, skippedMerge, end);
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setNodes(nodes);
        return definition;
    }

    /** 源运行：X 与 C 都走真分支，F 首次失败；完成顺序是执行顺序，与创建顺序相反。 */
    private static WorkflowRuntimeSnapshot source(WorkflowDefinitionDTO definition) {
        return new WorkflowRuntimeSnapshot("1", "trace-1", "1", 10L, definition, RuntimeState.FAILED,
                List.of(), List.of("start", "x", "c"), List.of("f"), Map.of(),
                Map.of("start", NodeResult.success(Map.of("input", "value"), Map.of("input", "value")).withNextNodeId("x"),
                        "x", NodeResult.success(Map.of()).withBranchKey("yes"),
                        "c", NodeResult.success(Map.of()).withBranchKey("yes"),
                        "f", new NodeResult(false, Map.of("error", "服务暂不可用"), Map.of(), null, null)),
                Instant.parse("2026-10-12T01:00:00Z"));
    }

    @Test
    void rerunSucceedsWhenConditionNodeWasCreatedBeforeItsUpstreamCondition() {
        WorkflowDefinitionDTO definition = definition(true);
        WorkflowRuntimeSnapshot source = source(definition);
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "f");
        assertThat(plan.eligible()).as(String.join("；", plan.blockers())).isTrue();

        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());
        AtomicInteger failedCalls = new AtomicInteger();
        AtomicInteger endCalls = new AtomicInteger();
        List<String> executed = new CopyOnWriteArrayList<>();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> { throw new AssertionError("已完成起点不可重跑"); }),
                executor("CONDITION", context -> { throw new AssertionError("已完成条件节点不可重跑"); }),
                executor("SERVICE", context -> {
                    executed.add(context.currentNodeId());
                    if ("f".equals(context.currentNodeId())) {
                        failedCalls.incrementAndGet();
                        return NodeResult.success(Map.of("result", "fresh")).withNextNodeId("e");
                    }
                    throw new AssertionError("被跳过的分支节点不得执行：" + context.currentNodeId());
                }),
                executor("END", context -> {
                    endCalls.incrementAndGet();
                    executed.add(context.currentNodeId());
                    return NodeResult.success(Map.of("final", "done"));
                })));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(seed);
        List<RuntimeEvent> events = new ArrayList<>();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry, new RuntimeStateMachine(), events::add,
                duration -> {}, repository);

        var result = engine.resume(request(seed), seed.toExecutionSnapshot());

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(failedCalls).hasValue(1);
        assertThat(endCalls).hasValue(1);
        assertThat(executed).containsExactly("f", "e");
    }

    @Test
    void rerunSucceedsWithTheSameResultWhenCreationOrderMatchesExecutionOrder() {
        WorkflowDefinitionDTO definition = definition(false);
        WorkflowRuntimeSnapshot source = source(definition);
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "f");
        assertThat(plan.eligible()).as(String.join("；", plan.blockers())).isTrue();

        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());
        AtomicInteger endCalls = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> { throw new AssertionError("已完成起点不可重跑"); }),
                executor("CONDITION", context -> { throw new AssertionError("已完成条件节点不可重跑"); }),
                executor("SERVICE", context -> {
                    if ("f".equals(context.currentNodeId())) {
                        return NodeResult.success(Map.of("result", "fresh")).withNextNodeId("e");
                    }
                    throw new AssertionError("被跳过的分支节点不得执行：" + context.currentNodeId());
                }),
                executor("END", context -> {
                    endCalls.incrementAndGet();
                    return NodeResult.success(Map.of("final", "done"));
                })));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(seed);
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry, new RuntimeStateMachine(), event -> {},
                duration -> {}, repository);

        var result = engine.resume(request(seed), seed.toExecutionSnapshot());

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(endCalls).hasValue(1);
    }

    @Test
    void failedNodeThatFailsAgainKeepsTheFailureTerminalState() {
        WorkflowDefinitionDTO definition = definition(true);
        WorkflowRuntimeSnapshot source = source(definition);
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "f");
        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> { throw new AssertionError("已完成起点不可重跑"); }),
                executor("CONDITION", context -> { throw new AssertionError("已完成条件节点不可重跑"); }),
                executor("SERVICE", context -> {
                    if ("f".equals(context.currentNodeId())) {
                        throw new IllegalStateException("服务仍然不可用");
                    }
                    throw new AssertionError("被跳过的分支节点不得执行：" + context.currentNodeId());
                }),
                executor("END", context -> { throw new AssertionError("失败后不得继续执行结束节点"); })));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(seed);
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry, new RuntimeStateMachine(), event -> {},
                duration -> {}, repository);

        // 失败必须原样冒泡，不能被跳过分支的恢复逻辑吞掉后报成功。
        assertThatThrownBy(() -> engine.resume(request(seed), seed.toExecutionSnapshot()))
                .hasMessageContaining("服务仍然不可用");
    }

    @Test
    void preservedNodesKeepTheirOutputsAndAreNotExecutedAgain() {
        WorkflowDefinitionDTO definition = definition(true);
        WorkflowRuntimeSnapshot source = source(definition);
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "f");

        assertThat(plan.preservedNodeIds()).containsExactlyInAnyOrder("start", "x", "c");
        assertThat(plan.invalidatedNodeIds()).containsExactlyInAnyOrder("f", "e");
        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of());
        assertThat(seed.nodeOutputs()).containsOnlyKeys("start", "x", "c");
        assertThat(seed.variables()).containsEntry("input", "value");
    }

    private static WorkflowRuntimeRequest request(WorkflowRuntimeSnapshot snapshot) {
        return new WorkflowRuntimeRequest(snapshot.workflowId(), snapshot.traceId(), snapshot.taskId(),
                snapshot.definition(), snapshot.variables(), com.aetherflow.workflow.runtime.api.RetryPolicy.none());
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
