package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.*;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.persistence.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import static org.assertj.core.api.Assertions.*;

class NestedWorkflowRecoveryTest {
    @Test void 异步批次按限额启动并在重启后只执行剩余步骤() {
        List<String> dispatched = new ArrayList<>(); AtomicInteger finished = new AtomicInteger();
        MemorySnapshots repository = new MemorySnapshots();
        NodeRegistry registry = new NodeRegistry(List.of(executor("ASYNC", ctx -> {
            dispatched.add(ctx.currentNodeId()); return NodeResult.waiting(Map.of("externalTaskId", dispatched.size()));
        }), executor("FINISH", ctx -> { finished.incrementAndGet(); return NodeResult.success(Map.of(), Map.of("value", ctx.variables().get("answer"))); })));
        WorkflowRuntimeRequest request = request("CONTINUE", 2, List.of("a", "b", "c"));
        WorkflowRuntimeEngine engine = engine(registry, repository);
        WorkflowExecutionSnapshot first = engine.execute(request);
        assertThat(first.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(dispatched).containsExactly("batch/iteration-0/async", "batch/iteration-1/async");
        assertThat(first.currentNodeIds()).containsExactly("batch");
        engine = engine(registry, repository);
        WorkflowExecutionSnapshot second = engine.completeWaitingNode(request, first, dispatched.get(1), NodeResult.success(Map.of(), Map.of("answer", "B")));
        assertThat(second.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(dispatched).hasSize(3); assertThat(finished).hasValue(1);
        WorkflowExecutionSnapshot third = engine.completeWaitingNode(request, second, dispatched.get(0), NodeResult.success(Map.of(), Map.of("answer", "A")));
        WorkflowExecutionSnapshot last = engine.completeWaitingNode(request, third, dispatched.get(2), NodeResult.success(Map.of(), Map.of("answer", "C")));
        assertThat(last.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(dispatched).hasSize(3); assertThat(finished).hasValue(3);
        assertThat(last.completedNodeIds()).containsExactly("batch");
        assertThat((List<?>) last.variables().get("results")).hasSize(3);
        assertThat(engine.completeWaitingNode(request, last, dispatched.get(2), NodeResult.success(Map.of()))).isEqualTo(last);
    }

    @Test void 失败策略继续保留错误项且不会重复已完成项() {
        List<String> ids = new ArrayList<>();
        NodeRegistry registry = new NodeRegistry(List.of(executor("ASYNC", ctx -> {
            ids.add(ctx.currentNodeId()); return NodeResult.waiting(Map.of("externalTaskId", ids.size()));
        }), executor("FINISH", ctx -> NodeResult.success(Map.of(), Map.of("done", true)))));
        MemorySnapshots repository = new MemorySnapshots(); WorkflowRuntimeEngine engine = engine(registry, repository);
        WorkflowRuntimeRequest request = request("CONTINUE", 1, List.of("a", "b"));
        WorkflowExecutionSnapshot first = engine.execute(request);
        WorkflowExecutionSnapshot next = engine.failWaitingNode(request, first, ids.get(0), "模型暂不可用");
        assertThat(next.runtimeState()).isEqualTo(RuntimeState.WAITING); assertThat(ids).hasSize(2);
        WorkflowExecutionSnapshot last = engine.completeWaitingNode(request, next, ids.get(1), NodeResult.success(Map.of()));
        assertThat(last.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        List<?> results = (List<?>) last.nodeOutputs().get("batch").output().get("results");
        assertThat((Map<?, ?>) results.get(0)).containsValue("FAILED").containsValue("模型暂不可用");
    }

    @Test void 失败策略停止使根节点失败并保留已完成检查点() {
        NodeRegistry registry = new NodeRegistry(List.of(executor("ASYNC", ctx -> NodeResult.waiting(Map.of("externalTaskId", 1))), executor("FINISH", ctx -> NodeResult.success(Map.of()))));
        MemorySnapshots repository = new MemorySnapshots(); WorkflowRuntimeEngine engine = engine(registry, repository);
        WorkflowRuntimeRequest request = request("STOP", 1, List.of("a", "b"));
        WorkflowExecutionSnapshot first = engine.execute(request);
        WorkflowExecutionSnapshot failed = engine.failWaitingNode(request, first, "batch/iteration-0/async", "离线");
        assertThat(failed.runtimeState()).isEqualTo(RuntimeState.FAILED);
        assertThat(failed.failedNodeIds()).contains("batch");
        assertThat((List<?>) failed.nodeOutputs().get("batch").output().get("results")).hasSize(1);
        assertThat(failed.nodeOutputs()).doesNotContainKey("batch/iteration-1/async");
    }

    @Test void 重复已完成回调不重新调度并保留其他等待项() {
        NodeRegistry registry = new NodeRegistry(List.of(executor("ASYNC", ctx -> NodeResult.waiting(Map.of("externalTaskId", 1))), executor("FINISH", ctx -> NodeResult.success(Map.of()))));
        MemorySnapshots repository = new MemorySnapshots(); WorkflowRuntimeEngine engine = engine(registry, repository);
        WorkflowRuntimeRequest request = request("CONTINUE", 2, List.of("a", "b"));
        WorkflowExecutionSnapshot first = engine.execute(request);
        WorkflowExecutionSnapshot second = engine.completeWaitingNode(request, first, "batch/iteration-0/async", NodeResult.success(Map.of()));
        WorkflowExecutionSnapshot repeated = engine.completeWaitingNode(request, second, "batch/iteration-0/async", NodeResult.success(Map.of()));
        assertThat(repeated).isEqualTo(second);
    }

    @Test void 重复外部回执不重复执行产物适配器() {
        NodeRegistry registry = new NodeRegistry(List.of(executor("ASYNC", context -> NodeResult.waiting(Map.of("externalTaskId", 17))),
                executor("FINISH", context -> NodeResult.success(Map.of()))));
        MemorySnapshots repository = new MemorySnapshots(); WorkflowRuntimeEngine engine = engine(registry, repository);
        WorkflowRuntimeRequest original = request("CONTINUE", 2, List.of("a", "b"));
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(original.workflowId(), original.traceId(), original.taskId(),
                original.definition(), Map.of("items", List.of("a", "b"), "userId", 1), RetryPolicy.none());
        engine.execute(request); AtomicInteger adaptations = new AtomicInteger();
        java.util.function.Function<WorkflowRuntimeSnapshot, NodeResult> adapt = ignored -> {
            adaptations.incrementAndGet(); return NodeResult.success(Map.of());
        };
        engine.completeWaitingNode("1001", "batch/iteration-0/async", 17L, adapt, RetryPolicy.none());
        engine.completeWaitingNode("1001", "batch/iteration-0/async", 17L, adapt, RetryPolicy.none());
        assertThat(adaptations).hasValue(1);
    }

    @Test void 子节点检查点持久化后中断恢复不重复已完成调用() {
        AtomicInteger paid = new AtomicInteger(); AtomicInteger tail = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("ASYNC", context -> { paid.incrementAndGet(); return NodeResult.success(Map.of(), Map.of("answer", "已保存")); }),
                executor("FINISH", context -> { tail.incrementAndGet(); return NodeResult.success(Map.of()); })));
        MemorySnapshots crash = new MemorySnapshots() {
            boolean stopped;
            @Override public void save(WorkflowRuntimeSnapshot snapshot) {
                if (stopped) throw new com.aetherflow.workflow.runtime.core.WorkflowRuntimeLeaseLostException("模拟进程已退出");
                super.save(snapshot);
                if (snapshot.nodeOutputs().containsKey("batch/iteration-0/async")) {
                    stopped = true;
                    throw new com.aetherflow.workflow.runtime.core.WorkflowRuntimeLeaseLostException("模拟检查点落盘后退出");
                }
            }
        };
        WorkflowRuntimeRequest request = request("STOP", 1, List.of("a"));
        assertThatThrownBy(() -> engine(registry, crash).execute(request))
                .isInstanceOf(com.aetherflow.workflow.runtime.core.WorkflowRuntimeLeaseLostException.class);
        assertThat(paid).hasValue(1); assertThat(tail).hasValue(0);
        MemorySnapshots recovery = new MemorySnapshots(); recovery.value = crash.value;
        WorkflowExecutionSnapshot completed = engine(registry, recovery).resume(request, crash.value.toExecutionSnapshot());
        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(paid).hasValue(1); assertThat(tail).hasValue(1);
    }

    private static WorkflowRuntimeEngine engine(NodeRegistry registry, MemorySnapshots repository) {
        return new WorkflowRuntimeEngine(registry, new RuntimeStateMachine(), event -> {}, RuntimeSleeper.noop(), repository);
    }
    private static WorkflowRuntimeRequest request(String strategy, int concurrency, List<String> items) {
        WorkflowNodeDTO node = new WorkflowNodeDTO(); node.setNodeId("batch"); node.setNodeType("ITERATION");
        node.setConfig(Map.of("inputVariable", "items", "outputVariable", "results", "failureStrategy", strategy, "concurrency", concurrency,
                "bodyNodes", List.of(Map.of("nodeId", "async", "nodeType", "ASYNC", "config", Map.of()), Map.of("nodeId", "finish", "nodeType", "FINISH", "config", Map.of()))));
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO(); definition.setName("批处理"); definition.setNodes(List.of(node));
        return new WorkflowRuntimeRequest("1001", "trace", "task", definition, Map.of("items", items), RetryPolicy.none());
    }
    private static NodeExecutor executor(String type, Function<WorkflowContext, NodeResult> run) {
        return new NodeExecutor() { public NodeType nodeType() { return NodeType.of(type); } public NodeResult execute(WorkflowContext ctx) { return run.apply(ctx); } };
    }
    private static class MemorySnapshots implements RuntimeSnapshotRepository {
        WorkflowRuntimeSnapshot value;
        public void save(WorkflowRuntimeSnapshot snapshot) { value = snapshot; }
        public Optional<WorkflowRuntimeSnapshot> findByWorkflowId(String id) { return Optional.ofNullable(value); }
        public List<WorkflowRuntimeSnapshot> findRecoverable(int limit) { return value == null ? List.of() : List.of(value); }
    }
}
