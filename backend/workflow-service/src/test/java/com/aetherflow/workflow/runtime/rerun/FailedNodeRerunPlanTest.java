package com.aetherflow.workflow.runtime.rerun;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.*;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.*;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLockLease;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.*;

class FailedNodeRerunPlanTest {
    @Test
    void invalidatesTransitiveDescendantsAndReconstructsVariablesAndNestedOutputs() {
        WorkflowRuntimeSnapshot source = source(RuntimeState.FAILED);
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(source, "failed");
        assertThat(plan.eligible()).isTrue();
        assertThat(plan.invalidatedNodeIds()).containsExactly("failed", "downstream");
        assertThat(plan.preservedNodeIds()).containsExactly("start", "unrelated");
        WorkflowRuntimeSnapshot seed = plan.seed(source, "2", "trace-2", Map.of("input", "original", "old", "initial"));
        assertThat(seed.runtimeState()).isEqualTo(RuntimeState.PENDING);
        assertThat(seed.nodeOutputs()).containsOnlyKeys("start", "unrelated", "unrelated/iteration-0/body");
        assertThat(seed.variables()).containsEntry("input", "ancestor").containsEntry("old", "initial")
                .containsEntry("kept", "paid-output").doesNotContainKey("stale");
        assertThat((Map<?, ?>) seed.variables().get("__nestedContexts")).hasSize(1);
        assertThat(seed.failedNodeIds()).isEmpty();
        assertThat(source.runtimeState()).isEqualTo(RuntimeState.FAILED);
        assertThat(source.nodeOutputs()).containsKey("downstream");
    }

    @Test
    void refusesAllOtherTerminalAndActiveStates() {
        for (RuntimeState state : RuntimeState.values()) {
            if (state == RuntimeState.FAILED) continue;
            assertThat(FailedNodeRerunPlan.from(source(state), "failed").eligible()).as(state.name()).isFalse();
        }
        assertThat(FailedNodeRerunPlan.from(source(RuntimeState.FAILED), "start").eligible()).isFalse();
    }

    @Test
    void refusesUnfinishedUnrelatedBranchRatherThanRepeatingItsWork() {
        WorkflowRuntimeSnapshot original = source(RuntimeState.FAILED);
        WorkflowRuntimeSnapshot incomplete = new WorkflowRuntimeSnapshot(original.workflowId(), original.traceId(), original.taskId(),
                10L, original.definition(), RuntimeState.FAILED, List.of(), List.of("start"), List.of("failed", "unrelated"),
                original.variables(), original.nodeOutputs(), original.updatedAt());
        FailedNodeRerunPlan plan = FailedNodeRerunPlan.from(incomplete, "failed");
        assertThat(plan.eligible()).isFalse();
        assertThat(plan.blockers()).contains("无关分支尚无可复用结果：unrelated");
    }

    @Test
    void resumesOnlyInvalidatedNodesAndDuplicateRecoveryDoesNotRepeatCalls() {
        WorkflowRuntimeSnapshot source = source(RuntimeState.FAILED);
        WorkflowRuntimeSnapshot seed = FailedNodeRerunPlan.from(source, "failed").seed(source, "2", "trace-2", Map.of());
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(seed);
        AtomicInteger paidCalls = new AtomicInteger();
        AtomicInteger downstreamCalls = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> { throw new AssertionError("已完成祖先不可重跑"); }),
                executor("UNRELATED", context -> { throw new AssertionError("已完成无关付费节点不可重跑"); }),
                executor("FAILED", context -> {
                    paidCalls.incrementAndGet();
                    assertThat(context.nodeOutputs()).containsKeys("start", "unrelated").doesNotContainKey("downstream");
                    assertThat(context.variables()).containsEntry("kept", "paid-output").doesNotContainKey("stale");
                    return NodeResult.success(Map.of("result", "fresh"), Map.of("fresh", true));
                }),
                executor("DOWNSTREAM", context -> {
                    downstreamCalls.incrementAndGet();
                    assertThat(context.variables()).containsEntry("fresh", true);
                    return NodeResult.success(Map.of("final", "new"));
                })));
        List<RuntimeEvent> events = new java.util.concurrent.CopyOnWriteArrayList<>();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry, new RuntimeStateMachine(), events::add, duration -> {}, repository);
        WorkflowRuntimeRequest request = request(seed);
        assertThat(engine.resume(request, seed.toExecutionSnapshot()).runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(engine.resume(request, seed.toExecutionSnapshot()).runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(paidCalls).hasValue(1);
        assertThat(downstreamCalls).hasValue(1);
        assertThat(events.stream().filter(event -> Boolean.TRUE.equals(event.attributes().get("reused"))).map(RuntimeEvent::nodeId))
                .containsExactly("start", "unrelated");
    }

    @Test
    void concurrentRecoveryUsesRuntimeLeaseAndThenReadsLatestReceipt() throws Exception {
        WorkflowRuntimeSnapshot original = source(RuntimeState.FAILED);
        WorkflowRuntimeSnapshot seed = FailedNodeRerunPlan.from(original, "failed").seed(original, "2", "trace-2", Map.of());
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(seed);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch finish = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        AtomicBoolean locked = new AtomicBoolean();
        WorkflowRuntimeLock lock = new WorkflowRuntimeLock() {
            public Optional<WorkflowRuntimeLockLease> acquire(String id) {
                return locked.compareAndSet(false, true) ? Optional.of(new WorkflowRuntimeLockLease(id, "test", Duration.ZERO)) : Optional.empty();
            }
            public boolean renew(WorkflowRuntimeLockLease lease) { return true; }
            public boolean release(WorkflowRuntimeLockLease lease) { locked.set(false); return true; }
        };
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(
                executor("FAILED", context -> {
                    calls.incrementAndGet(); entered.countDown();
                    try { if (!finish.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("等待超时"); }
                    catch (InterruptedException exception) { throw new IllegalStateException(exception); }
                    return NodeResult.success(Map.of());
                }), executor("DOWNSTREAM", context -> NodeResult.success(Map.of())))),
                new RuntimeStateMachine(), event -> {}, duration -> {}, repository, lock);
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        try {
            var first = executor.submit(() -> engine.resume(request(seed), seed.toExecutionSnapshot()));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> engine.resume(request(seed), seed.toExecutionSnapshot())).hasMessageContaining("lock already held");
            finish.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS).runtimeState()).isEqualTo(RuntimeState.SUCCESS);
            assertThat(engine.resume(request(seed), seed.toExecutionSnapshot()).runtimeState()).isEqualTo(RuntimeState.SUCCESS);
            assertThat(calls).hasValue(1);
        } finally { finish.countDown(); executor.shutdownNow(); }
    }

    @Test
    void retainsUnselectedBranchesWithoutExecutingThem() {
        WorkflowDefinitionDTO definition = definition(node("branch", "BRANCH", Map.of("branches", Map.of("yes", "failed", "no", "skipped"))),
                node("failed", "FAILED", Map.of("next", "end")), node("skipped", "SKIPPED", Map.of("next", "end")), node("end", "END", Map.of()));
        WorkflowRuntimeSnapshot source = new WorkflowRuntimeSnapshot("1", "trace-1", "1", 10L, definition, RuntimeState.FAILED,
                List.of(), List.of("branch"), List.of("failed"), Map.of(), Map.of("branch", NodeResult.success(Map.of()).withBranchKey("yes")), Instant.now());
        assertThat(FailedNodeRerunPlan.from(source, "failed").eligible()).isTrue();
    }

    private static WorkflowRuntimeRequest request(WorkflowRuntimeSnapshot snapshot) {
        return new WorkflowRuntimeRequest(snapshot.workflowId(), snapshot.traceId(), snapshot.taskId(), snapshot.definition(), snapshot.variables(), RetryPolicy.none());
    }

    public static WorkflowRuntimeSnapshot source(RuntimeState state) {
        WorkflowDefinitionDTO definition = definition(node("start", "START", Map.of("nextNodes", List.of("failed", "unrelated"))),
                node("failed", "FAILED", Map.of("next", "downstream")), node("downstream", "DOWNSTREAM", Map.of()), node("unrelated", "UNRELATED", Map.of()));
        return new WorkflowRuntimeSnapshot("1", "trace-1", "1", 10L, definition, state, List.of(),
                List.of("start", "unrelated", "downstream"), List.of("failed"),
                Map.of("stale", "old", "__nestedContexts", Map.of("unrelated/iteration-0/body", Map.of("kept", true), "failed/iteration-0/body", Map.of("old", true))),
                Map.of("start", NodeResult.success(Map.of("input", "ancestor"), Map.of("input", "ancestor")),
                        "unrelated", NodeResult.success(Map.of("kept", "paid-output"), Map.of("kept", "paid-output")),
                        "unrelated/iteration-0/body", NodeResult.success(Map.of("nested", "paid-output")),
                        "failed/iteration-0/body", NodeResult.success(Map.of("old", true)),
                        "downstream", NodeResult.success(Map.of("stale", "old"), Map.of("old", "overwrite", "stale", "old"))), Instant.parse("2026-10-12T01:00:00Z"));
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO(); definition.setNodes(List.of(nodes)); return definition;
    }
    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO(); node.setNodeId(id); node.setNodeType(type); node.setConfig(config); return node;
    }
    private static NodeExecutor executor(String type, Function<WorkflowContext, NodeResult> behavior) {
        return new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of(type); }
            public NodeResult execute(WorkflowContext context) { return behavior.apply(context); }
        };
    }
}
