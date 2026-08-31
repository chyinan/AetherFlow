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
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkflowRuntimeEngineTest {

    @Test
    void releasesRuntimeThreadWhileNodeWaitsAndContinuesAfterExternalCompletion() {
        AtomicInteger asyncDispatches = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("ASYNC_AI", context -> {
                    asyncDispatches.incrementAndGet();
                    return NodeResult.waiting(Map.of("externalTaskId", 91L));
                }),
                executor("EXPORT", context -> {
                    assertThat(context.variables()).containsEntry("summary", "done");
                    return NodeResult.success(Map.of("exported", true));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "workflow-async", "trace-async", "task-async",
                definition(
                        node("node-ai", "ASYNC_AI", Map.of()),
                        node("node-export", "EXPORT", Map.of())
                ),
                Map.of(), RetryPolicy.none());

        WorkflowExecutionSnapshot waiting = engine.execute(request);

        assertThat(waiting.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(waiting.currentNodeIds()).containsExactly("node-ai");
        assertThat(waiting.completedNodeIds()).doesNotContain("node-ai");

        WorkflowExecutionSnapshot completed = engine.completeWaitingNode(
                request,
                waiting,
                "node-ai",
                NodeResult.success(Map.of("summary", "done"), Map.of("summary", "done")));

        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(completed.completedNodeIds()).containsExactly("node-ai", "node-export");
        assertThat(asyncDispatches).hasValue(1);
    }

    @Test
    void durableCancellationProbeStopsExecutionBeforeAnyNodeDispatch() {
        AtomicInteger executions = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(executor("MOCK", context -> {
            executions.incrementAndGet();
            return NodeResult.success(Map.of("ok", true));
        })));
        List<RuntimeEvent> events = new ArrayList<>();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry, new RuntimeStateMachine(), events::add, RuntimeSleeper.threadSleep(),
                RuntimeSnapshotRepository.noop(), WorkflowRuntimeLock.noop(), workflowId -> true);

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "1001", "trace-cancel", "task-cancel",
                definition(node("node", "MOCK", Map.of())), Map.of(), RetryPolicy.none()));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.CANCELLED);
        assertThat(executions).hasValue(0);
        assertThat(events).anyMatch(event -> event.eventType() == RuntimeEventType.WORKFLOW_CANCELLED);
    }

    @Test
    void executesIterationBodyForEachItemAndCollectsResults() {
        AtomicInteger bodyExecutions = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("TRANSFORM", context -> {
                    bodyExecutions.incrementAndGet();
                    String item = String.valueOf(context.variables().get("item"));
                    return NodeResult.success(
                            Map.of("value", item.toUpperCase()),
                            Map.of("transformed", item.toUpperCase()));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);
        WorkflowNodeDTO iteration = node("iteration", "ITERATION", Map.of(
                "inputVariable", "items",
                "itemVariable", "item",
                "outputVariable", "results",
                "maxIterations", 2,
                "bodyNodes", List.of(Map.of(
                        "nodeId", "transform",
                        "nodeType", "TRANSFORM",
                        "config", Map.of()
                ))
        ));

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-iteration-body", "trace-iteration-body", "task-iteration-body",
                definition(iteration),
                Map.of("items", List.of("a", "b", "c")), RetryPolicy.none()));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(bodyExecutions).hasValue(2);
        assertThat(snapshot.variables().get("results")).isEqualTo(List.of(
                Map.of("item", "a", "variables", Map.of("transformed", "A")),
                Map.of("item", "b", "variables", Map.of("transformed", "B"))
        ));
    }

    @Test
    void executesLoopBodyUntilStopConditionAndKeepsLoopBounded() {
        AtomicInteger bodyExecutions = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("INCREMENT", context -> {
                    bodyExecutions.incrementAndGet();
                    @SuppressWarnings("unchecked")
                    Map<String, Object> state = (Map<String, Object>) context.variables().get("state");
                    int count = ((Number) state.get("count")).intValue() + 1;
                    Map<String, Object> nextState = Map.of("count", count, "done", count >= 3);
                    return NodeResult.success(Map.of("state", nextState), Map.of("state", nextState));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);
        WorkflowNodeDTO loop = node("loop", "LOOP", Map.of(
                "inputVariable", "state",
                "outputVariable", "state",
                "stopWhen", "done",
                "maxIterations", 5,
                "bodyNodes", List.of(Map.of(
                        "nodeId", "increment",
                        "nodeType", "INCREMENT",
                        "config", Map.of()
                ))
        ));

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-loop-body", "trace-loop-body", "task-loop-body",
                definition(loop),
                Map.of("state", Map.of("count", 0, "done", false)), RetryPolicy.none()));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(bodyExecutions).hasValue(3);
        assertThat(snapshot.variables().get("state")).isEqualTo(Map.of("count", 3, "done", true));
    }

    @Test
    void executesNestedControlNodesInsideAnIterationBody() {
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("INCREMENT", context -> {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> state = (Map<String, Object>) context.variables().get("state");
                    int count = ((Number) state.get("count")).intValue() + 1;
                    Map<String, Object> nextState = Map.of("count", count, "done", count >= 2);
                    return NodeResult.success(Map.of("state", nextState), Map.of("state", nextState));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);
        WorkflowNodeDTO iteration = node("iteration", "ITERATION", Map.of(
                "inputVariable", "items",
                "itemVariable", "state",
                "outputVariable", "results",
                "maxIterations", 2,
                "bodyNodes", List.of(Map.of(
                        "nodeId", "loop",
                        "nodeType", "LOOP",
                        "config", Map.of(
                                "inputVariable", "state",
                                "outputVariable", "state",
                                "stopWhen", "done",
                                "maxIterations", 3,
                                "bodyNodes", List.of(Map.of(
                                        "nodeId", "increment",
                                        "nodeType", "INCREMENT",
                                        "config", Map.of()
                                ))
                        )
                ))
        ));

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-nested-control", "trace-nested-control", "task-nested-control",
                definition(iteration),
                Map.of("items", List.of(
                        Map.of("count", 0, "done", false),
                        Map.of("count", 1, "done", false)
                )), RetryPolicy.none()));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshot.variables().get("results")).isEqualTo(List.of(
                Map.of("item", Map.of("count", 0, "done", false),
                        "variables", Map.of("state", Map.of("count", 2, "done", true))),
                Map.of("item", Map.of("count", 1, "done", false),
                        "variables", Map.of("state", Map.of("count", 2, "done", true)))
        ));
    }

    @Test
    void reloadsLatestWaitingSnapshotWhenParallelExternalResultsUseSameInitialSnapshot() {
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("LEFT", context -> NodeResult.waiting(Map.of("externalTaskId", 1L))),
                executor("RIGHT", context -> NodeResult.waiting(Map.of("externalTaskId", 2L)))
        ));
        InMemoryRuntimeSnapshotRepository snapshots = new InMemoryRuntimeSnapshotRepository();
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry,
                new RuntimeStateMachine(),
                event -> {},
                RuntimeSleeper.threadSleep(),
                snapshots);
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "workflow-parallel-wait", "trace-parallel-wait", "task-parallel-wait",
                definition(
                        node("start", "START", Map.of("nextNodes", List.of("left", "right"))),
                        node("left", "LEFT", Map.of()),
                        node("right", "RIGHT", Map.of())
                ),
                Map.of(), RetryPolicy.none());

        WorkflowExecutionSnapshot initialWaiting = engine.execute(request);
        WorkflowExecutionSnapshot afterLeft = engine.completeWaitingNode(
                request, initialWaiting, "left", NodeResult.success(Map.of("left", true)));
        WorkflowExecutionSnapshot completed = engine.completeWaitingNode(
                request, initialWaiting, "right", NodeResult.success(Map.of("right", true)));

        assertThat(afterLeft.runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(afterLeft.currentNodeIds()).containsExactly("right");
        assertThat(completed.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(completed.completedNodeIds()).contains("start", "left", "right");
    }

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
    void completesTriggeredJoinWhenAnotherPredecessorWasSkipped() {
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("CONDITION", context -> NodeResult.success(Map.of()).withBranchKey("left")),
                executor("LEFT", context -> NodeResult.success(Map.of("left", true))),
                executor("RIGHT", context -> NodeResult.success(Map.of("right", true))),
                executor("JOIN", context -> NodeResult.success(Map.of("joined", true)))
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-incomplete-join",
                "trace-incomplete-join",
                "task-incomplete-join",
                definition(
                        node("condition", "CONDITION", Map.of("branches", Map.of("left", "left", "right", "right"))),
                        node("left", "LEFT", Map.of("next", "join")),
                        node("right", "RIGHT", Map.of("next", "join")),
                        node("join", "JOIN", Map.of())
                ),
                Map.of(),
                RetryPolicy.none()
        ));

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshot.completedNodeIds()).containsExactly("condition", "left", "join");
        assertThat(snapshot.nodeOutputs()).doesNotContainKey("right");
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

    @Test
    void executesFanOutBranchesConcurrently() throws Exception {
        CountDownLatch bothStarted = new CountDownLatch(2);
        CountDownLatch releaseBranches = new CountDownLatch(1);
        Set<String> started = ConcurrentHashMap.newKeySet();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("LEFT", context -> {
                    started.add("left");
                    bothStarted.countDown();
                    await(releaseBranches);
                    return NodeResult.success(Map.of("left", true));
                }),
                executor("RIGHT", context -> {
                    started.add("right");
                    bothStarted.countDown();
                    await(releaseBranches);
                    return NodeResult.success(Map.of("right", true));
                }),
                executor("JOIN", context -> NodeResult.success(Map.of("joined", true)))
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);

        CompletableFuture<WorkflowExecutionSnapshot> execution = CompletableFuture.supplyAsync(() ->
                engine.execute(new WorkflowRuntimeRequest(
                        "workflow-parallel",
                        "trace-parallel",
                        "task-parallel",
                        definition(
                                node("start", "START", Map.of("nextNodes", List.of("left", "right"))),
                                node("left", "LEFT", Map.of("next", "join")),
                                node("right", "RIGHT", Map.of("next", "join")),
                                node("join", "JOIN", Map.of())
                        ),
                        Map.of(),
                        RetryPolicy.none()
                )));

        try {
            assertThat(bothStarted.await(500, TimeUnit.MILLISECONDS)).isTrue();
            assertThat(started).containsExactlyInAnyOrder("left", "right");
        } finally {
            releaseBranches.countDown();
        }
        WorkflowExecutionSnapshot snapshot = execution.get(2, TimeUnit.SECONDS);
        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshot.completedNodeIds()).contains("start", "left", "right", "join");
    }

    @Test
    void isolatesCurrentNodeIdentityAcrossParallelExecutors() throws Exception {
        CountDownLatch bothStarted = new CountDownLatch(2);
        CountDownLatch releaseBranches = new CountDownLatch(1);
        Map<String, String> observedNodeIds = new ConcurrentHashMap<>();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("LEFT", context -> {
                    bothStarted.countDown();
                    await(releaseBranches);
                    observedNodeIds.put("left", context.currentNodeId());
                    return NodeResult.success(Map.of("leftNode", context.currentNodeId()));
                }),
                executor("RIGHT", context -> {
                    bothStarted.countDown();
                    await(releaseBranches);
                    observedNodeIds.put("right", context.currentNodeId());
                    return NodeResult.success(Map.of("rightNode", context.currentNodeId()));
                }),
                executor("JOIN", context -> NodeResult.success(Map.of()))
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);

        CompletableFuture<WorkflowExecutionSnapshot> execution = CompletableFuture.supplyAsync(() ->
                engine.execute(new WorkflowRuntimeRequest(
                        "workflow-parallel-context",
                        "trace-parallel-context",
                        "task-parallel-context",
                        definition(
                                node("start", "START", Map.of("nextNodes", List.of("left", "right"))),
                                node("left", "LEFT", Map.of("next", "join")),
                                node("right", "RIGHT", Map.of("next", "join")),
                                node("join", "JOIN", Map.of())
                        ),
                        Map.of(),
                        RetryPolicy.none()
                )));

        try {
            assertThat(bothStarted.await(500, TimeUnit.MILLISECONDS)).isTrue();
        } finally {
            releaseBranches.countDown();
        }

        WorkflowExecutionSnapshot snapshot = execution.get(2, TimeUnit.SECONDS);
        assertThat(observedNodeIds).containsExactlyInAnyOrderEntriesOf(Map.of(
                "left", "left",
                "right", "right"
        ));
        assertThat(snapshot.nodeOutputs().get("left").output()).containsEntry("leftNode", "left");
        assertThat(snapshot.nodeOutputs().get("right").output()).containsEntry("rightNode", "right");
    }

    @Test
    void fanInJoinWaitsForEveryPredecessor() throws Exception {
        CountDownLatch fastCompleted = new CountDownLatch(1);
        CountDownLatch slowStarted = new CountDownLatch(1);
        CountDownLatch releaseSlow = new CountDownLatch(1);
        AtomicBoolean joinStartedBeforeSlowRelease = new AtomicBoolean(false);
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("FAST", context -> {
                    fastCompleted.countDown();
                    return NodeResult.success(Map.of("fast", true));
                }),
                executor("SLOW", context -> {
                    slowStarted.countDown();
                    await(fastCompleted);
                    await(releaseSlow);
                    return NodeResult.success(Map.of("slow", true));
                }),
                executor("JOIN", context -> {
                    if (releaseSlow.getCount() > 0) {
                        joinStartedBeforeSlowRelease.set(true);
                    }
                    return NodeResult.success(Map.of("joined", true));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);

        CompletableFuture<WorkflowExecutionSnapshot> execution = CompletableFuture.supplyAsync(() ->
                engine.execute(new WorkflowRuntimeRequest(
                        "workflow-join",
                        "trace-join",
                        "task-join",
                        definition(
                                node("start", "START", Map.of("nextNodes", List.of("fast", "slow"))),
                                node("fast", "FAST", Map.of("next", "join")),
                                node("slow", "SLOW", Map.of("next", "join")),
                                node("join", "JOIN", Map.of())
                        ),
                        Map.of(),
                        RetryPolicy.none()
                )));

        assertThat(slowStarted.await(500, TimeUnit.MILLISECONDS)).isTrue();
        assertThat(fastCompleted.await(500, TimeUnit.MILLISECONDS)).isTrue();
        assertThat(joinStartedBeforeSlowRelease).isFalse();
        releaseSlow.countDown();
        WorkflowExecutionSnapshot snapshot = execution.get(2, TimeUnit.SECONDS);
        assertThat(snapshot.completedNodeIds()).containsSubsequence("start", "join");
        assertThat(joinStartedBeforeSlowRelease).isFalse();
    }

    @Test
    void retriesFailedParallelBranchAndThenRunsJoin() {
        AtomicInteger attempts = new AtomicInteger();
        RecordingRuntimeEventPublisher publisher = new RecordingRuntimeEventPublisher();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("UNSTABLE", context -> {
                    int attempt = attempts.incrementAndGet();
                    if (attempt < 2) {
                        throw new IllegalStateException("temporary branch failure");
                    }
                    return NodeResult.success(Map.of("attempt", attempt));
                }),
                executor("RIGHT", context -> NodeResult.success(Map.of("right", true))),
                executor("JOIN", context -> {
                    assertThat(context.nodeOutputs()).containsKeys("unstable", "right");
                    return NodeResult.success(Map.of("joined", true));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry,
                new RuntimeStateMachine(),
                publisher,
                RuntimeSleeper.noop()
        );

        WorkflowExecutionSnapshot snapshot = engine.execute(new WorkflowRuntimeRequest(
                "workflow-branch-retry",
                "trace-branch-retry",
                "task-branch-retry",
                definition(
                        node("start", "START", Map.of("nextNodes", List.of("unstable", "right"))),
                        node("unstable", "UNSTABLE", Map.of("next", "join")),
                        node("right", "RIGHT", Map.of("next", "join")),
                        node("join", "JOIN", Map.of())
                ),
                Map.of(),
                RetryPolicy.of(2, Duration.ZERO, 1.0D, Duration.ZERO)
        ));

        assertThat(attempts).hasValue(2);
        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshot.completedNodeIds()).contains("start", "unstable", "right", "join");
        assertThat(publisher.events().stream()
                .filter(event -> event.eventType() == RuntimeEventType.NODE_RETRYING))
                .hasSize(1);
    }

    @Test
    void failsWorkflowWhenParallelBranchExhaustsRetryAndDoesNotRunJoin() {
        AtomicInteger attempts = new AtomicInteger();
        AtomicInteger joinStarts = new AtomicInteger();
        RecordingRuntimeEventPublisher publisher = new RecordingRuntimeEventPublisher();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("START", context -> NodeResult.success(Map.of())),
                executor("BROKEN", context -> {
                    attempts.incrementAndGet();
                    throw new IllegalStateException("branch failed");
                }),
                executor("RIGHT", context -> NodeResult.success(Map.of("right", true))),
                executor("JOIN", context -> {
                    joinStarts.incrementAndGet();
                    return NodeResult.success(Map.of("joined", true));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry,
                new RuntimeStateMachine(),
                publisher,
                RuntimeSleeper.noop()
        );

        assertThatThrownBy(() -> engine.execute(new WorkflowRuntimeRequest(
                "workflow-branch-fail",
                "trace-branch-fail",
                "task-branch-fail",
                definition(
                        node("start", "START", Map.of("nextNodes", List.of("broken", "right"))),
                        node("broken", "BROKEN", Map.of("next", "join")),
                        node("right", "RIGHT", Map.of("next", "join")),
                        node("join", "JOIN", Map.of())
                ),
                Map.of(),
                RetryPolicy.of(2, Duration.ZERO, 1.0D, Duration.ZERO)
        )))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("branch failed");

        assertThat(attempts).hasValue(2);
        assertThat(joinStarts).hasValue(0);
        assertThat(publisher.events())
                .extracting(RuntimeEvent::eventType)
                .contains(RuntimeEventType.NODE_RETRYING, RuntimeEventType.WORKFLOW_FAILED)
                .doesNotContain(RuntimeEventType.WORKFLOW_COMPLETED);
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

    private static NodeExecutor executor(String type, NodeBehavior behavior) {
        return executor(type, new ArrayList<>(), behavior);
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

    private static void await(CountDownLatch latch) throws InterruptedException {
        if (!latch.await(2, TimeUnit.SECONDS)) {
            throw new AssertionError("timed out waiting for latch");
        }
    }

    private static final class RecordingRuntimeEventPublisher implements RuntimeEventPublisher {

        private final List<RuntimeEvent> events = Collections.synchronizedList(new ArrayList<>());

        @Override
        public void publish(RuntimeEvent event) {
            events.add(event);
        }

        List<RuntimeEvent> events() {
            return List.copyOf(events);
        }
    }
}
