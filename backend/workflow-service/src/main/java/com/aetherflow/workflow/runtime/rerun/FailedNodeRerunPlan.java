package com.aetherflow.workflow.runtime.rerun;

import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.dag.WorkflowDag;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// pattern: Functional Core
/** 只重跑失败节点及其后代；缺少无关分支结果时明确阻止，绝不暗中重做付费节点。 */
public record FailedNodeRerunPlan(String nodeId, List<String> invalidatedNodeIds,
                                  List<String> preservedNodeIds, List<String> blockers) {

    public boolean eligible() {
        return blockers.isEmpty();
    }

    public static FailedNodeRerunPlan from(WorkflowRuntimeSnapshot source, String nodeId) {
        WorkflowDag dag = WorkflowDag.from(source.definition());
        dag.node(nodeId);
        Set<String> invalidated = new LinkedHashSet<>();
        ArrayDeque<String> pending = new ArrayDeque<>(List.of(nodeId));
        while (!pending.isEmpty()) {
            String current = pending.remove();
            if (invalidated.add(current)) pending.addAll(dag.declaredNextNodeIds(current));
        }
        List<String> blockers = new ArrayList<>();
        if (source.runtimeState() != RuntimeState.FAILED) blockers.add("仅失败终态运行可局部重跑");
        if (!source.failedNodeIds().contains(nodeId)) blockers.add("所选节点没有失败记录");
        Set<String> completed = new LinkedHashSet<>(source.completedNodeIds());
        // 复用节点必须沿用源运行的真实完成顺序：跳过状态恢复是顺序敏感的，
        // 按定义里的节点创建顺序排列会让较晚完成的条件节点抢先回放，
        // 导致共享汇合点既没有被跳过也没有被执行。
        List<String> preserved = source.completedNodeIds().stream()
                .filter(dag.nodeIds()::contains)
                .filter(completed::contains)
                .filter(id -> !invalidated.contains(id)).toList();
        Set<String> skipped = skippedNodes(dag, source);
        for (String id : dag.nodeIds()) {
            if (!invalidated.contains(id) && !completed.contains(id) && !skipped.contains(id)) {
                blockers.add("无关分支尚无可复用结果：" + id);
            }
        }
        for (String id : preserved) {
            NodeResult output = source.nodeOutputs().get(id);
            if (output == null || output.waiting() || !output.successful()) blockers.add("已完成节点缺少可复用输出：" + id);
        }
        if (source.currentNodeIds().stream().anyMatch(id -> !source.failedNodeIds().contains(id))) {
            blockers.add("原运行仍有未结束节点，暂不可复用快照");
        }
        return new FailedNodeRerunPlan(nodeId,
                dag.nodeIds().stream().filter(invalidated::contains).toList(), preserved, List.copyOf(blockers));
    }

    /** 与恢复引擎一致地还原已完成分支的跳过节点，不将其算作需要执行的工作。 */
    private static Set<String> skippedNodes(WorkflowDag dag, WorkflowRuntimeSnapshot source) {
        Set<String> skipped = new LinkedHashSet<>();
        Set<String> completed = Set.copyOf(source.completedNodeIds());
        for (String id : source.completedNodeIds()) {
            NodeResult output = source.nodeOutputs().get(id);
            if (output == null || output.waiting()
                    || ((output.nextNodeId() == null || output.nextNodeId().isBlank())
                        && (output.branchKey() == null || output.branchKey().isBlank()))) continue;
            Set<String> selected = Set.copyOf(dag.nextNodeIds(id, output));
            for (String next : dag.declaredNextNodeIds(id)) {
                if (!selected.contains(next)) replaySkipped(dag, source, next, id, completed, skipped);
            }
        }
        return skipped;
    }

    private static void replaySkipped(WorkflowDag dag, WorkflowRuntimeSnapshot source, String id,
                                      String predecessor, Set<String> completed, Set<String> skipped) {
        if (completed.contains(id) || skipped.contains(id) || source.currentNodeIds().contains(id)) return;
        NodeResult output = source.nodeOutputs().get(id);
        if (output != null && output.waiting()) return;
        if (dag.predecessorNodeIds(id).stream().anyMatch(parent -> !parent.equals(predecessor) && !skipped.contains(parent))) return;
        skipped.add(id);
        for (String next : dag.declaredNextNodeIds(id)) {
            if (dag.predecessorNodeIds(next).stream().allMatch(skipped::contains)) {
                replaySkipped(dag, source, next, id, completed, skipped);
            }
        }
    }

    public WorkflowRuntimeSnapshot seed(WorkflowRuntimeSnapshot source, String workflowId, String traceId,
                                        Map<String, Object> initialVariables) {
        if (!eligible()) throw new IllegalStateException(String.join("；", blockers));
        Map<String, NodeResult> outputs = new LinkedHashMap<>();
        source.nodeOutputs().forEach((id, output) -> {
            if (preservedNodeIds.stream().anyMatch(root -> id.equals(root) || id.startsWith(root + "/"))) {
                outputs.put(id, output);
            }
        });
        Map<String, Object> variables = new LinkedHashMap<>(initialVariables);
        // 同名变量由最后写入者生效：必须沿用原运行的真实写入顺序，
        // 不能按深度与节点 ID 重建，否则重跑会读到另一份最终值。
        List<String> completionOrder = source.completedNodeIds();
        Map<String, Integer> completionIndex = new java.util.HashMap<>();
        for (int index = 0; index < completionOrder.size(); index++) {
            completionIndex.putIfAbsent(completionOrder.get(index), index);
        }
        Map<String, Integer> depths = WorkflowDag.from(source.definition()).topologicalDepths();
        preservedNodeIds.stream()
                .sorted(Comparator.comparingInt((String id) -> completionIndex.getOrDefault(id, Integer.MAX_VALUE))
                        .thenComparing(Comparator.comparingInt(id -> depths.getOrDefault(id, 0))))
                .forEach(id -> variables.putAll(outputs.get(id).variables()));
        // 嵌套执行的已完成上下文仅在所属根节点被复用时保留。
        for (String key : List.of("__nestedContexts", "__nestedNodeTypes")) {
            if (source.variables().get(key) instanceof Map<?, ?> nested) {
                Map<String, Object> retained = new LinkedHashMap<>();
                nested.forEach((id, value) -> {
                    if (id instanceof String scoped && preservedNodeIds.stream()
                            .anyMatch(root -> scoped.equals(root) || scoped.startsWith(root + "/"))) {
                        retained.put(scoped, value);
                    }
                });
                variables.put(key, retained);
            }
        }
        return new WorkflowRuntimeSnapshot(workflowId, traceId, workflowId, source.definitionId(), source.definition(),
                RuntimeState.PENDING, List.of(), preservedNodeIds, List.of(), variables, outputs, Instant.now());
    }
}
