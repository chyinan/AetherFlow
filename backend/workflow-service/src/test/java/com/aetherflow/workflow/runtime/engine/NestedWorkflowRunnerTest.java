package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NestedWorkflowRunnerTest {
    @Test void 等待结果保留当轮已完成输出且恢复不重复调用() {
        AtomicInteger preparations = new AtomicInteger();
        AtomicInteger dispatches = new AtomicInteger();
        AtomicInteger completions = new AtomicInteger();
        BiFunction<WorkflowNodeDTO, DefaultWorkflowContext, NodeResult> execute = (node, context) -> {
            int index = (int) context.variables().get("loopIteration");
            return switch (node.getNodeType()) {
                case "PREPARE" -> {
                    preparations.incrementAndGet();
                    yield NodeResult.success(Map.of(), Map.of("prepared", "round-" + index));
                }
                case "ASYNC" -> {
                    dispatches.incrementAndGet();
                    yield NodeResult.waiting(Map.of("externalTaskId", index + 1));
                }
                case "FINISH" -> {
                    completions.incrementAndGet();
                    yield NodeResult.success(Map.of(), Map.of("loopState", index + 1));
                }
                default -> throw new AssertionError(node.getNodeType());
            };
        };
        WorkflowNodeDTO loop = loop(2, List.of(step("prepare", "PREPARE"), step("async", "ASYNC"), step("finish", "FINISH")));
        DefaultWorkflowContext root = new DefaultWorkflowContext("loop-run", "trace", "task", Map.of("state", 0));
        NodeResult first = run(root, execute, loop);
        assertTrue(first.waiting());
        assertEquals(0, first.output().get("iterations"));
        assertEquals(List.of("loop/loop-0/async"), first.output().get(NestedWorkflowRunner.WAITING));
        assertEquals(List.of(Map.of("index", 0, "status", "WAITING", "variables", Map.of("prepared", "round-0"))), first.output().get("results"));
        assertEquals(Map.of(), first.variables());

        DefaultWorkflowContext recovered = restore(root);
        assertEquals(first, run(recovered, execute, loop));
        assertEquals(1, preparations.get()); assertEquals(1, dispatches.get()); assertEquals(0, completions.get());
        recovered.recordNodeOutput("loop/loop-0/async", NodeResult.success(Map.of(), Map.of("answer", "first")));
        NodeResult second = run(recovered, execute, loop);
        assertTrue(second.waiting());
        assertEquals(1, second.output().get("iterations"));
        assertEquals(List.of(
                Map.of("index", 0, "status", "SUCCESS", "variables", Map.of("prepared", "round-0", "answer", "first", "loopState", 1)),
                Map.of("index", 1, "status", "WAITING", "variables", Map.of("prepared", "round-1"))), second.output().get("results"));

        DefaultWorkflowContext resumed = restore(recovered);
        assertEquals(second, run(resumed, execute, loop));
        resumed.recordNodeOutput("loop/loop-1/async", NodeResult.success(Map.of(), Map.of("answer", "second")));
        NodeResult completed = run(resumed, execute, loop);
        assertTrue(completed.successful() && !completed.waiting());
        assertEquals(2, completed.output().get("iterations"));
        assertEquals(Map.of("loopState", 2), completed.variables());
        assertEquals(List.of(
                Map.of("index", 0, "status", "SUCCESS", "variables", Map.of("prepared", "round-0", "answer", "first", "loopState", 1)),
                Map.of("index", 1, "status", "SUCCESS", "variables", Map.of("prepared", "round-1", "answer", "second", "loopState", 2))), completed.output().get("results"));
        assertEquals(2, preparations.get()); assertEquals(2, dispatches.get()); assertEquals(2, completions.get());
        assertEquals(completed, run(resumed, execute, loop));
        assertEquals(2, preparations.get()); assertEquals(2, dispatches.get()); assertEquals(2, completions.get());
    }

    @Test void 第一节点等待也显示空输出的当轮结果() {
        WorkflowNodeDTO loop = loop(1, List.of(step("async", "ASYNC")));
        DefaultWorkflowContext root = new DefaultWorkflowContext("loop-run", "trace", "task", Map.of());
        NodeResult waiting = run(root, (node, context) -> NodeResult.waiting(Map.of("externalTaskId", 1)), loop);
        assertTrue(waiting.waiting());
        assertEquals(0, waiting.output().get("iterations"));
        assertEquals(List.of(Map.of("index", 0, "status", "WAITING", "variables", Map.of())), waiting.output().get("results"));
    }

    private static NodeResult run(DefaultWorkflowContext root, BiFunction<WorkflowNodeDTO, DefaultWorkflowContext, NodeResult> execute, WorkflowNodeDTO loop) {
        return new NestedWorkflowRunner(root, execute, () -> {}, () -> {}).run(loop, root.variables());
    }
    private static DefaultWorkflowContext restore(DefaultWorkflowContext root) {
        DefaultWorkflowContext recovered = new DefaultWorkflowContext(root.workflowId(), root.traceId(), root.taskId(), root.variables());
        root.nodeOutputs().forEach(recovered::recordNodeOutput);
        return recovered;
    }
    private static WorkflowNodeDTO loop(int maximum, List<Map<String, Object>> body) {
        WorkflowNodeDTO node = new WorkflowNodeDTO(); node.setNodeId("loop"); node.setNodeType("LOOP");
        node.setConfig(Map.of("maxIterations", maximum, "bodyNodes", body)); return node;
    }
    private static Map<String, Object> step(String id, String type) {
        return Map.of("nodeId", id, "nodeType", type, "config", Map.of());
    }
}
