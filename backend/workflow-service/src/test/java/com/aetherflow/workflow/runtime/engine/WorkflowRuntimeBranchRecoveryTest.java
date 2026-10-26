package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.executor.AiWorkflowNodeResultAdapter;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowRuntimeBranchRecoveryTest {

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void keepsUnselectedBranchSkippedAcrossConsecutiveWaitsAndColdEngines(boolean asynchronousClassifier)
            throws Exception {
        Map<String, AtomicInteger> executions = new ConcurrentHashMap<>();
        NodeResult route = AiWorkflowNodeResultAdapter.adapt(
                "QUESTION_CLASSIFIER", Map.of("completionText", "{\"route\":\"selected\"}"));
        NodeRegistry registry = registry(executions, asynchronousClassifier
                ? NodeResult.waiting(Map.of("externalTaskId", 1L)) : route);
        WorkflowRuntimeRequest request = request(definition(
                // 故意逆着依赖顺序声明节点，不能依赖画布创建顺序重建跳过状态。
                node("end", "END", Map.of()),
                node("rejected-tail", "REJECTED", Map.of("next", "end")),
                node("rejected", "REJECTED", Map.of("next", "rejected-tail")),
                node("second", "ASYNC", Map.of("next", "end")),
                node("first", "ASYNC", Map.of("next", "second")),
                node("classifier", "QUESTION_CLASSIFIER", Map.of("branches", Map.of(
                        "selected", "first", "rejected", "rejected")))
        ));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        WorkflowExecutionSnapshot waiting = engine(registry, repository).execute(request);
        if (asynchronousClassifier) {
            assertThat(waiting.currentNodeIds()).containsExactly("classifier");
            repository = reload(repository, request.workflowId());
            waiting = engine(registry, repository).completeWaitingNode(request, waiting, "classifier", route);
        }
        assertThat(waiting.currentNodeIds()).containsExactly("first");
        assertUnselectedNeverExecuted(waiting, executions, "rejected", "rejected-tail");

        repository = reload(repository, request.workflowId());
        WorkflowRuntimeEngine afterRestart = engine(registry, repository);
        WorkflowExecutionSnapshot afterFirst = afterRestart.completeWaitingNode(
                request, waiting, "first", NodeResult.success(Map.of("firstResult", "done")));
        assertThat(afterFirst.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(afterFirst.currentNodeIds()).containsExactly("second");
        assertUnselectedNeverExecuted(afterFirst, executions, "rejected", "rejected-tail");
        assertThat(count(executions, "end")).isZero();

        // 仓库中的新检查点必须胜过重复回执携带的旧等待快照。
        WorkflowExecutionSnapshot duplicate = afterRestart.completeWaitingNode(
                request, waiting, "first", NodeResult.success(Map.of("firstResult", "duplicate")));
        assertThat(duplicate).isEqualTo(afterFirst);
        assertThat(count(executions, "second")).isEqualTo(1);

        repository = reload(repository, request.workflowId());
        WorkflowExecutionSnapshot completed = engine(registry, repository).completeWaitingNode(
                request, afterFirst, "second", NodeResult.success(Map.of("secondResult", "done")));
        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(completed.completedNodeIds()).containsExactly("classifier", "first", "second", "end");
        assertUnselectedNeverExecuted(completed, executions, "rejected", "rejected-tail");
        assertThat(count(executions, "classifier")).isEqualTo(1);
        assertThat(count(executions, "first")).isEqualTo(1);
        assertThat(count(executions, "second")).isEqualTo(1);
        assertThat(count(executions, "end")).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void restoresLegacySnapshotWhenEveryClassifierRejectsTheSameSharedBranch(boolean reverseCompletionOrder)
            throws Exception {
        Map<String, AtomicInteger> executions = new ConcurrentHashMap<>();
        NodeRegistry registry = registry(executions, NodeResult.success(Map.of()).withBranchKey("selected"));
        WorkflowDefinitionDTO definition = definition(
                node("end", "END", Map.of()),
                node("rejected-tail", "REJECTED", Map.of("next", "end")),
                node("rejected", "REJECTED", Map.of("next", "rejected-tail")),
                node("right", "ASYNC", Map.of("next", "end")),
                node("left", "ASYNC", Map.of("next", "end")),
                node("right-classifier", "QUESTION_CLASSIFIER", Map.of("branches", Map.of(
                        "selected", "right", "rejected", "rejected"))),
                node("left-classifier", "QUESTION_CLASSIFIER", Map.of("branches", Map.of(
                        "selected", "left", "rejected", "rejected")))
        );
        WorkflowRuntimeRequest request = request(definition);
        // 旧快照没有 skipped 字段，只含原有的完成列表和真实路由结果。
        WorkflowRuntimeSnapshot legacy = new WorkflowRuntimeSnapshot(
                request.workflowId(), request.traceId(), request.taskId(), null, definition, RuntimeState.RUNNING,
                List.of("left", "right"), reverseCompletionOrder
                        ? List.of("right-classifier", "left-classifier")
                        : List.of("left-classifier", "right-classifier"), List.of(), Map.of(),
                Map.of("left-classifier", NodeResult.success(Map.of()).withBranchKey("selected"),
                        "right-classifier", NodeResult.success(Map.of()).withNextNodeId("right")), Instant.now());
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(legacy);
        repository = reload(repository, request.workflowId());
        WorkflowExecutionSnapshot waiting = engine(registry, repository).resume(request, legacy.toExecutionSnapshot());
        assertThat(waiting.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(waiting.currentNodeIds()).containsExactly("left", "right");
        assertUnselectedNeverExecuted(waiting, executions, "rejected", "rejected-tail");

        repository = reload(repository, request.workflowId());
        WorkflowExecutionSnapshot afterLeft = engine(registry, repository).completeWaitingNode(
                request, waiting, "left", NodeResult.success(Map.of()));
        assertThat(afterLeft.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(afterLeft.currentNodeIds()).containsExactly("right");
        assertThat(count(executions, "end")).isZero();
        assertUnselectedNeverExecuted(afterLeft, executions, "rejected", "rejected-tail");

        repository = reload(repository, request.workflowId());
        WorkflowExecutionSnapshot completed = engine(registry, repository).completeWaitingNode(
                request, afterLeft, "right", NodeResult.success(Map.of()));
        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(completed.completedNodeIds()).containsExactlyInAnyOrder(
                "left-classifier", "right-classifier", "left", "right", "end");
        assertUnselectedNeverExecuted(completed, executions, "rejected", "rejected-tail");
        assertThat(count(executions, "left-classifier")).isZero();
        assertThat(count(executions, "right-classifier")).isZero();
        assertThat(count(executions, "end")).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void keepsDirectSharedEndUntilSelectedAsynchronousPathCompletes(boolean selectDirectEnd) throws Exception {
        Map<String, AtomicInteger> executions = new ConcurrentHashMap<>();
        NodeRegistry registry = registry(executions, NodeResult.waiting(Map.of("externalTaskId", 1L)));
        WorkflowRuntimeRequest request = request(definition(
                node("classifier", "QUESTION_CLASSIFIER", Map.of("branches", Map.of(
                        "selected", "first", "direct", "end"))),
                node("first", "ASYNC", Map.of("next", "end")),
                node("end", "END", Map.of())
        ));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        WorkflowExecutionSnapshot waiting = engine(registry, repository).execute(request);
        WorkflowExecutionSnapshot afterClassifier = engine(registry, repository).completeWaitingNode(
                request, waiting, "classifier", NodeResult.success(Map.of())
                        .withNextNodeId(selectDirectEnd ? "end" : "first"));
        WorkflowExecutionSnapshot completed = afterClassifier;
        if (!selectDirectEnd) {
            assertThat(afterClassifier.runtimeState()).isEqualTo(RuntimeState.WAITING);
            assertThat(count(executions, "end")).isZero();
            repository = reload(repository, request.workflowId());
            completed = engine(registry, repository).completeWaitingNode(
                    request, afterClassifier, "first", NodeResult.success(Map.of()));
        } else {
            assertUnselectedNeverExecuted(completed, executions, "first");
        }
        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(count(executions, "end")).isEqualTo(1);
    }

    @Test
    void keepsUnselectedBranchSkippedWhenNestedWaitingNodeCompletes() throws Exception {
        Map<String, AtomicInteger> executions = new ConcurrentHashMap<>();
        NodeRegistry registry = registry(executions, NodeResult.success(Map.of()).withBranchKey("selected"));
        WorkflowDefinitionDTO definition = definition(
                node("classifier", "QUESTION_CLASSIFIER", Map.of("branches", Map.of(
                        "selected", "batch", "rejected", "rejected"))),
                node("batch", "ITERATION", Map.of("next", "end", "inputVariable", "items",
                        "outputVariable", "results", "concurrency", 1,
                        "bodyNodes", List.of(Map.of("nodeId", "leaf", "nodeType", "ASYNC", "config", Map.of())))),
                node("rejected", "REJECTED", Map.of("next", "end")),
                node("end", "END", Map.of())
        );
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "workflow-nested-branch", "trace-nested-branch", "task-nested-branch",
                definition, Map.of("items", List.of("item")), RetryPolicy.none());
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        WorkflowExecutionSnapshot waiting = engine(registry, repository).execute(request);
        assertThat(waiting.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(waiting.currentNodeIds()).containsExactly("batch");
        assertUnselectedNeverExecuted(waiting, executions, "rejected");
        assertThat(count(executions, "end")).isZero();

        repository = reload(repository, request.workflowId());
        WorkflowExecutionSnapshot completed = engine(registry, repository).completeWaitingNode(
                request, waiting, "batch/iteration-0/leaf", NodeResult.success(Map.of("answer", "done")));
        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(completed.completedNodeIds()).containsExactly("classifier", "batch", "end");
        assertUnselectedNeverExecuted(completed, executions, "rejected");
        assertThat(count(executions, "batch/iteration-0/leaf")).isEqualTo(1);
        assertThat(count(executions, "end")).isEqualTo(1);
    }

    @Test
    void keepsAnEmptyBranchSelectionAcrossAnUnrelatedAsyncCompletion() throws Exception {
        Map<String, AtomicInteger> executions = new ConcurrentHashMap<>();
        NodeRegistry registry = registry(executions, NodeResult.success(Map.of()).withBranchKey("unmatched"));
        WorkflowRuntimeRequest request = request(definition(
                node("classifier", "QUESTION_CLASSIFIER", Map.of("branches", Map.of("only", "rejected"))),
                node("rejected", "REJECTED", Map.of("next", "end")),
                node("pending", "ASYNC", Map.of("next", "end")),
                node("end", "END", Map.of())
        ));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        WorkflowExecutionSnapshot waiting = engine(registry, repository).execute(request);
        assertThat(waiting.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(waiting.currentNodeIds()).containsExactly("pending");
        assertUnselectedNeverExecuted(waiting, executions, "rejected");

        repository = reload(repository, request.workflowId());
        WorkflowExecutionSnapshot completed = engine(registry, repository).completeWaitingNode(
                request, waiting, "pending", NodeResult.success(Map.of()));
        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(completed.completedNodeIds()).containsExactlyInAnyOrder("classifier", "pending", "end");
        assertUnselectedNeverExecuted(completed, executions, "rejected");
        assertThat(count(executions, "end")).isEqualTo(1);
    }

    private static void assertUnselectedNeverExecuted(WorkflowExecutionSnapshot snapshot,
                                                     Map<String, AtomicInteger> executions, String... ids) {
        for (String id : ids) {
            assertThat(count(executions, id)).as("未选节点 %s 的执行次数", id).isZero();
        }
        assertThat(snapshot.completedNodeIds()).doesNotContain(ids);
        assertThat(snapshot.nodeOutputs()).doesNotContainKeys(ids);
    }

    private static int count(Map<String, AtomicInteger> executions, String id) {
        return executions.getOrDefault(id, new AtomicInteger()).get();
    }

    private static NodeRegistry registry(Map<String, AtomicInteger> executions, NodeResult classifierResult) {
        return new NodeRegistry(List.of(
                executor("QUESTION_CLASSIFIER", executions, context -> classifierResult),
                executor("ASYNC", executions, context -> NodeResult.waiting(Map.of("externalTaskId", 2L))),
                executor("REJECTED", executions, context -> NodeResult.success(Map.of())),
                executor("END", executions, context -> NodeResult.success(Map.of()))
        ));
    }

    private static NodeExecutor executor(String type, Map<String, AtomicInteger> executions,
                                         Function<WorkflowContext, NodeResult> behavior) {
        return new NodeExecutor() {
            @Override
            public NodeType nodeType() {
                return NodeType.of(type);
            }

            @Override
            public NodeResult execute(WorkflowContext context) {
                executions.computeIfAbsent(context.currentNodeId(), ignored -> new AtomicInteger()).incrementAndGet();
                return behavior.apply(context);
            }
        };
    }

    private static WorkflowRuntimeEngine engine(NodeRegistry registry, InMemoryRuntimeSnapshotRepository repository) {
        return new WorkflowRuntimeEngine(registry, new RuntimeStateMachine(), event -> {}, RuntimeSleeper.noop(), repository);
    }

    private static InMemoryRuntimeSnapshotRepository reload(InMemoryRuntimeSnapshotRepository source, String workflowId)
            throws Exception {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        String json = mapper.writeValueAsString(source.findByWorkflowId(workflowId).orElseThrow());
        assertThat(json).doesNotContain("skippedNodeIds");
        InMemoryRuntimeSnapshotRepository reloaded = new InMemoryRuntimeSnapshotRepository();
        reloaded.save(mapper.readValue(json, WorkflowRuntimeSnapshot.class));
        return reloaded;
    }

    private static WorkflowRuntimeRequest request(WorkflowDefinitionDTO definition) {
        return new WorkflowRuntimeRequest("workflow-branch-recovery", "trace-branch-recovery", "task-branch-recovery",
                definition, Map.of(), RetryPolicy.none());
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("分支等待恢复回归");
        definition.setNodes(List.of(nodes));
        return definition;
    }

    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setDisplayName(id);
        node.setConfig(config);
        return node;
    }
}
