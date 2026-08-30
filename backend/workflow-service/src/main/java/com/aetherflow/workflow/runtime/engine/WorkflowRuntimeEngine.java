package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeWaitingException;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.dag.WorkflowDag;
import com.aetherflow.workflow.runtime.logging.RuntimeLogContext;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLockLease;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import java.util.function.Function;

@Slf4j
// pattern: Imperative Shell
public class WorkflowRuntimeEngine {

    private static final int MAX_NESTED_ITERATIONS = 1_000;
    private static final int MAX_NESTED_BODY_NODES = 100;

    private final NodeRegistry nodeRegistry;
    private final RuntimeStateMachine stateMachine;
    private final RuntimeEventPublisher eventPublisher;
    private final RuntimeSleeper runtimeSleeper;
    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowRuntimeLock workflowRuntimeLock;
    private final InheritableThreadLocal<AtomicBoolean> activeLockLost = new InheritableThreadLocal<>();

    public WorkflowRuntimeEngine(NodeRegistry nodeRegistry) {
        this(nodeRegistry, new RuntimeStateMachine(), event -> {
        }, RuntimeSleeper.threadSleep());
    }

    public WorkflowRuntimeEngine(NodeRegistry nodeRegistry, RuntimeStateMachine stateMachine) {
        this(nodeRegistry, stateMachine, event -> {
        }, RuntimeSleeper.threadSleep());
    }

    public WorkflowRuntimeEngine(NodeRegistry nodeRegistry,
                                 RuntimeStateMachine stateMachine,
                                 RuntimeEventPublisher eventPublisher,
                                 RuntimeSleeper runtimeSleeper) {
        this(nodeRegistry, stateMachine, eventPublisher, runtimeSleeper, RuntimeSnapshotRepository.noop());
    }

    public WorkflowRuntimeEngine(NodeRegistry nodeRegistry,
                                 RuntimeStateMachine stateMachine,
                                 RuntimeEventPublisher eventPublisher,
                                 RuntimeSleeper runtimeSleeper,
                                 RuntimeSnapshotRepository snapshotRepository) {
        this(nodeRegistry, stateMachine, eventPublisher, runtimeSleeper, snapshotRepository, WorkflowRuntimeLock.noop());
    }

    public WorkflowRuntimeEngine(NodeRegistry nodeRegistry,
                                 RuntimeStateMachine stateMachine,
                                 RuntimeEventPublisher eventPublisher,
                                 RuntimeSleeper runtimeSleeper,
                                 RuntimeSnapshotRepository snapshotRepository,
                                 WorkflowRuntimeLock workflowRuntimeLock) {
        this.nodeRegistry = Objects.requireNonNull(nodeRegistry, "nodeRegistry must not be null");
        this.stateMachine = Objects.requireNonNull(stateMachine, "stateMachine must not be null");
        this.eventPublisher = Objects.requireNonNull(eventPublisher, "eventPublisher must not be null");
        this.runtimeSleeper = Objects.requireNonNull(runtimeSleeper, "runtimeSleeper must not be null");
        this.snapshotRepository = Objects.requireNonNull(snapshotRepository, "snapshotRepository must not be null");
        this.workflowRuntimeLock = Objects.requireNonNull(workflowRuntimeLock, "workflowRuntimeLock must not be null");
    }

    public WorkflowExecutionSnapshot execute(WorkflowRuntimeRequest request) {
        Objects.requireNonNull(request, "request must not be null");
        return withWorkflowLock(request.workflowId(), () -> executeLocked(request));
    }

    private WorkflowExecutionSnapshot executeLocked(WorkflowRuntimeRequest request) {
        WorkflowDag dag = WorkflowDag.from(request.definition());
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                request.workflowId(),
                request.traceId(),
                request.taskId(),
                request.variables()
        );
        context.updateRuntimeState(stateMachine.transition(RuntimeState.PENDING, RuntimeState.RUNNING));
        ExecutionTracker tracker = ExecutionTracker.empty();
        RuntimeLogContext.run(context, null,
                () -> log.info("workflow runtime started, totalNodes={}", dag.nodeCount()));
        publish(context, RuntimeEventType.WORKFLOW_STARTED, null, Map.of("totalNodes", dag.nodeCount()));
        saveSnapshot(request, context, tracker);

        try {
            if (executeDag(request, dag, context, tracker)) {
                context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.WAITING));
                publish(context, RuntimeEventType.WORKFLOW_WAITING, context.currentNodeId(), Map.of());
                saveSnapshot(request, context, tracker);
                return snapshot(context, tracker);
            }
            context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.SUCCESS));
            RuntimeLogContext.run(context, context.currentNodeId(),
                    () -> log.info("workflow runtime completed, completedNodes={}", tracker.completedNodeIds().size()));
            publish(context, RuntimeEventType.WORKFLOW_COMPLETED, context.currentNodeId(), Map.of());
            saveSnapshot(request, context, tracker);
            return snapshot(context, tracker);
        } catch (RuntimeException exception) {
            if (!stateMachine.isTerminal(context.runtimeState())) {
                context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.FAILED));
            }
            RuntimeLogContext.run(context, context.currentNodeId(),
                    () -> log.error("workflow runtime failed", exception));
            publish(context, RuntimeEventType.WORKFLOW_FAILED, context.currentNodeId(),
                    Map.of("error", exception.getMessage() == null ? exception.getClass().getName() : exception.getMessage()));
            saveSnapshot(request, context, tracker);
            throw exception;
        }
    }

    public WorkflowExecutionSnapshot resume(WorkflowRuntimeRequest request, WorkflowExecutionSnapshot recoverySnapshot) {
        Objects.requireNonNull(request, "request must not be null");
        Objects.requireNonNull(recoverySnapshot, "recoverySnapshot must not be null");
        if (stateMachine.isTerminal(recoverySnapshot.runtimeState())) {
            return recoverySnapshot;
        }
        return withWorkflowLock(request.workflowId(), () -> resumeLocked(request, recoverySnapshot));
    }

    private WorkflowExecutionSnapshot resumeLocked(WorkflowRuntimeRequest request,
                                                   WorkflowExecutionSnapshot recoverySnapshot) {
        WorkflowDag dag = WorkflowDag.from(request.definition());
        DefaultWorkflowContext context = contextFromSnapshot(recoverySnapshot);
        context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.RUNNING));
        ExecutionTracker tracker = ExecutionTracker.from(recoverySnapshot);
        replaySkippedBranches(dag, context, tracker);
        RuntimeLogContext.run(context, context.currentNodeId(),
                () -> log.info("workflow runtime recovering, completedNodes={}", tracker.completedNodeIds().size()));
        publish(context, RuntimeEventType.WORKFLOW_STARTED, context.currentNodeId(),
                Map.of("totalNodes", dag.nodeCount(), "recovered", true));
        saveSnapshot(request, context, tracker);

        try {
            if (executeDag(request, dag, context, tracker)) {
                context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.WAITING));
                publish(context, RuntimeEventType.WORKFLOW_WAITING, context.currentNodeId(), Map.of("recovered", true));
                saveSnapshot(request, context, tracker);
                return snapshot(context, tracker);
            }
            context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.SUCCESS));
            RuntimeLogContext.run(context, context.currentNodeId(),
                    () -> log.info("workflow runtime recovered, completedNodes={}", tracker.completedNodeIds().size()));
            publish(context, RuntimeEventType.WORKFLOW_COMPLETED, context.currentNodeId(), Map.of("recovered", true));
            saveSnapshot(request, context, tracker);
            return snapshot(context, tracker);
        } catch (RuntimeException exception) {
            if (!stateMachine.isTerminal(context.runtimeState())) {
                context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.FAILED));
            }
            RuntimeLogContext.run(context, context.currentNodeId(),
                    () -> log.error("workflow runtime recovery failed, reason={}", exception.getMessage()));
            publish(context, RuntimeEventType.WORKFLOW_FAILED, context.currentNodeId(),
                    Map.of("error", exception.getMessage() == null ? exception.getClass().getName() : exception.getMessage(),
                            "recovered", true));
            saveSnapshot(request, context, tracker);
            throw exception;
        }
    }

    private WorkflowExecutionSnapshot withWorkflowLock(String workflowId,
                                                       Supplier<WorkflowExecutionSnapshot> execution) {
        WorkflowRuntimeLockLease lease = workflowRuntimeLock.acquire(workflowId)
                .orElseThrow(() -> new IllegalStateException(
                        "workflow runtime lock already held for workflowId " + workflowId));
        AtomicBoolean lockLost = new AtomicBoolean(false);
        activeLockLost.set(lockLost);
        ScheduledExecutorService renewalExecutor = startLockRenewal(lease, lockLost);
        try {
            ensureLockHealthy();
            WorkflowExecutionSnapshot result = execution.get();
            ensureLockHealthy();
            return result;
        } finally {
            lockLost.set(true);
            if (renewalExecutor != null) {
                renewalExecutor.shutdownNow();
            }
            releaseLock(lease);
            activeLockLost.remove();
        }
    }

    public WorkflowExecutionSnapshot completeWaitingNode(WorkflowRuntimeRequest request,
                                                           WorkflowExecutionSnapshot waitingSnapshot,
                                                           String nodeId,
                                                           NodeResult result) {
        Objects.requireNonNull(request, "request must not be null");
        Objects.requireNonNull(waitingSnapshot, "waitingSnapshot must not be null");
        Objects.requireNonNull(result, "result must not be null");
        if (result.waiting()) {
            throw new IllegalArgumentException("external completion result must not remain waiting");
        }
        return withWorkflowLock(request.workflowId(), () -> completeWaitingNodeLocked(
                request, waitingSnapshot, nodeId, result));
    }

    public WorkflowExecutionSnapshot completeWaitingNode(String workflowId,
                                                          String nodeId,
                                                          Function<WorkflowRuntimeSnapshot, NodeResult> resultFactory,
                                                          RetryPolicy retryPolicy) {
        return completeWaitingNode(workflowId, nodeId, null, resultFactory, retryPolicy);
    }

    public WorkflowExecutionSnapshot completeWaitingNode(String workflowId,
                                                          String nodeId,
                                                          Long expectedExternalTaskId,
                                                          Function<WorkflowRuntimeSnapshot, NodeResult> resultFactory,
                                                          RetryPolicy retryPolicy) {
        Objects.requireNonNull(resultFactory, "resultFactory must not be null");
        return withWorkflowLock(workflowId, () -> {
            WorkflowRuntimeSnapshot stored = requiredSnapshot(workflowId);
            if (stateMachine.isTerminal(stored.runtimeState())) {
                return stored.toExecutionSnapshot();
            }
            if (stored.runtimeState() != RuntimeState.WAITING) {
                throw new IllegalStateException("workflow is not ready for external completion: "
                        + workflowId + " state=" + stored.runtimeState());
            }
            validateExternalTaskIdentity(stored, nodeId, expectedExternalTaskId);
            NodeResult result = Objects.requireNonNull(
                    resultFactory.apply(stored), "external completion result must not be null");
            if (result.waiting()) {
                throw new IllegalArgumentException("external completion result must not remain waiting");
            }
            WorkflowRuntimeRequest request = requestFromSnapshot(stored, retryPolicy);
            return runAsSnapshotOwner(stored, () -> completeWaitingNodeLocked(
                    request, stored.toExecutionSnapshot(), nodeId, result));
        });
    }

    private void validateExternalTaskIdentity(WorkflowRuntimeSnapshot snapshot,
                                              String nodeId,
                                              Long expectedExternalTaskId) {
        if (expectedExternalTaskId == null || nodeId == null) {
            return;
        }
        NodeResult waitingResult = snapshot.nodeOutputs().get(nodeId);
        Object actual = waitingResult == null ? null : waitingResult.output().get("externalTaskId");
        try {
            if (actual == null || Long.parseLong(String.valueOf(actual)) != expectedExternalTaskId) {
                throw new IllegalStateException("stale external AI completion ignored for node " + nodeId);
            }
        } catch (NumberFormatException exception) {
            throw new IllegalStateException("invalid external AI task identity for node " + nodeId, exception);
        }
    }

    public WorkflowExecutionSnapshot failWaitingNode(WorkflowRuntimeRequest request,
                                                       WorkflowExecutionSnapshot waitingSnapshot,
                                                       String nodeId,
                                                       String error) {
        Objects.requireNonNull(request, "request must not be null");
        Objects.requireNonNull(waitingSnapshot, "waitingSnapshot must not be null");
        return withWorkflowLock(request.workflowId(), () -> failWaitingNodeLocked(
                request, waitingSnapshot, nodeId, error));
    }

    public WorkflowExecutionSnapshot failWaitingNode(String workflowId,
                                                      String nodeId,
                                                      String error,
                                                      RetryPolicy retryPolicy) {
        return failWaitingNode(workflowId, nodeId, null, error, retryPolicy);
    }

    public WorkflowExecutionSnapshot failWaitingNode(String workflowId,
                                                      String nodeId,
                                                      Long expectedExternalTaskId,
                                                      String error,
                                                      RetryPolicy retryPolicy) {
        return withWorkflowLock(workflowId, () -> {
            WorkflowRuntimeSnapshot stored = requiredSnapshot(workflowId);
            validateExternalTaskIdentity(stored, nodeId, expectedExternalTaskId);
            WorkflowRuntimeRequest request = requestFromSnapshot(stored, retryPolicy);
            return runAsSnapshotOwner(stored, () -> failWaitingNodeLocked(
                    request, stored.toExecutionSnapshot(), nodeId, error));
        });
    }

    private WorkflowRuntimeSnapshot requiredSnapshot(String workflowId) {
        return snapshotRepository.findByWorkflowId(workflowId)
                .orElseThrow(() -> new IllegalStateException(
                        "workflow runtime snapshot not found: " + workflowId));
    }

    private WorkflowRuntimeRequest requestFromSnapshot(WorkflowRuntimeSnapshot stored, RetryPolicy retryPolicy) {
        return new WorkflowRuntimeRequest(
                stored.workflowId(),
                stored.traceId(),
                stored.taskId(),
                stored.definitionId(),
                stored.definition(),
                stored.variables(),
                retryPolicy == null ? RetryPolicy.none() : retryPolicy);
    }

    private WorkflowExecutionSnapshot runAsSnapshotOwner(WorkflowRuntimeSnapshot stored,
                                                         Supplier<WorkflowExecutionSnapshot> operation) {
        return AuthenticatedUserContext.runAs(
                snapshotUserId(stored.variables()),
                snapshotUsername(stored.variables()),
                operation);
    }

    private Long snapshotUserId(Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("userId");
        if (value instanceof Number number && number.longValue() > 0) {
            return number.longValue();
        }
        if (value != null) {
            try {
                long parsed = Long.parseLong(String.valueOf(value));
                if (parsed > 0) {
                    return parsed;
                }
            } catch (NumberFormatException ignored) {
                // Fall through to the explicit authentication error.
            }
        }
        throw new com.aetherflow.common.exception.BusinessException(
                com.aetherflow.common.core.ResultCode.UNAUTHORIZED,
                "authenticated user is required for workflow completion");
    }

    private String snapshotUsername(Map<String, Object> variables) {
        Object value = variables == null ? null : variables.get("username");
        return value == null || String.valueOf(value).isBlank()
                ? "aether.operator"
                : String.valueOf(value).trim();
    }

    private WorkflowExecutionSnapshot completeWaitingNodeLocked(WorkflowRuntimeRequest request,
                                                                 WorkflowExecutionSnapshot waitingSnapshot,
                                                                 String nodeId,
                                                                 NodeResult result) {
        WorkflowExecutionSnapshot currentSnapshot = latestSnapshot(request, waitingSnapshot);
        if (stateMachine.isTerminal(currentSnapshot.runtimeState())) {
            return currentSnapshot;
        }
        if (currentSnapshot.runtimeState() != RuntimeState.WAITING) {
            throw new IllegalStateException("workflow is not ready for external completion: "
                    + currentSnapshot.workflowId() + " state=" + currentSnapshot.runtimeState());
        }
        if (nodeId == null || !currentSnapshot.currentNodeIds().contains(nodeId)) {
            if (isAlreadyCompleted(currentSnapshot, nodeId)) {
                return currentSnapshot;
            }
            throw new IllegalArgumentException("node is not waiting: " + nodeId);
        }
        WorkflowDag dag = WorkflowDag.from(request.definition());
        DefaultWorkflowContext context = contextFromSnapshot(currentSnapshot);
        ExecutionTracker tracker = ExecutionTracker.from(currentSnapshot);
        context.updateRuntimeState(stateMachine.transition(RuntimeState.WAITING, RuntimeState.RUNNING));
        context.recordNodeOutput(nodeId, result);
        context.variables().putAll(result.variables());
        tracker.markCompleted(nodeId);
        publish(context, RuntimeEventType.NODE_COMPLETED, nodeId, Map.of("external", true));
        saveSnapshot(request, context, tracker);
        if (executeDag(request, dag, context, tracker)) {
            context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.WAITING));
            publish(context, RuntimeEventType.WORKFLOW_WAITING, context.currentNodeId(), Map.of());
        } else {
            context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.SUCCESS));
            publish(context, RuntimeEventType.WORKFLOW_COMPLETED, context.currentNodeId(), Map.of("resumed", true));
        }
        saveSnapshot(request, context, tracker);
        return snapshot(context, tracker);
    }

    private WorkflowExecutionSnapshot failWaitingNodeLocked(WorkflowRuntimeRequest request,
                                                               WorkflowExecutionSnapshot waitingSnapshot,
                                                               String nodeId,
                                                               String error) {
        WorkflowExecutionSnapshot currentSnapshot = latestSnapshot(request, waitingSnapshot);
        if (stateMachine.isTerminal(currentSnapshot.runtimeState())) {
            return currentSnapshot;
        }
        if (currentSnapshot.runtimeState() != RuntimeState.WAITING) {
            throw new IllegalStateException("workflow is not ready for external failure: "
                    + currentSnapshot.workflowId() + " state=" + currentSnapshot.runtimeState());
        }
        if (nodeId == null || !currentSnapshot.currentNodeIds().contains(nodeId)) {
            if (currentSnapshot.failedNodeIds().contains(nodeId)) {
                return currentSnapshot;
            }
            throw new IllegalArgumentException("node is not waiting: " + nodeId);
        }
        DefaultWorkflowContext context = contextFromSnapshot(currentSnapshot);
        ExecutionTracker tracker = ExecutionTracker.from(currentSnapshot);
        String safeError = error == null || error.isBlank() ? "AI task failed" : error;
        context.updateCurrentNodeId(nodeId);
        context.recordNodeOutput(nodeId, new NodeResult(false, Map.of("error", safeError), Map.of(), null, null));
        tracker.markFailed(nodeId);
        context.updateRuntimeState(stateMachine.transition(RuntimeState.WAITING, RuntimeState.FAILED));
        publish(context, RuntimeEventType.WORKFLOW_FAILED, nodeId,
                Map.of("error", safeError, "external", true));
        saveSnapshot(request, context, tracker);
        return snapshot(context, tracker);
    }

    private WorkflowExecutionSnapshot latestSnapshot(WorkflowRuntimeRequest request,
                                                     WorkflowExecutionSnapshot fallback) {
        return snapshotRepository.findByWorkflowId(request.workflowId())
                .map(WorkflowRuntimeSnapshot::toExecutionSnapshot)
                .orElse(fallback);
    }

    private boolean isAlreadyCompleted(WorkflowExecutionSnapshot snapshot, String nodeId) {
        return nodeId != null && (snapshot.completedNodeIds().contains(nodeId)
                || snapshot.failedNodeIds().contains(nodeId));
    }

    private ScheduledExecutorService startLockRenewal(WorkflowRuntimeLockLease lease,
                                                       AtomicBoolean lockLost) {
        Duration interval = renewalInterval(lease.ttl());
        if (interval.isZero() || interval.isNegative()) {
            return null;
        }
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "workflow-runtime-lock-renewal-" + lease.workflowId());
            thread.setDaemon(true);
            return thread;
        });
        executor.scheduleAtFixedRate(
                () -> renewLock(lease, lockLost),
                interval.toMillis(),
                interval.toMillis(),
                TimeUnit.MILLISECONDS
        );
        return executor;
    }

    private Duration renewalInterval(Duration ttl) {
        if (ttl == null || ttl.isZero() || ttl.isNegative()) {
            return Duration.ZERO;
        }
        long ttlMillis = ttl.toMillis();
        if (ttlMillis <= 1L) {
            return Duration.ofMillis(1L);
        }
        long intervalMillis = Math.max(100L, ttlMillis / 3L);
        return Duration.ofMillis(Math.min(intervalMillis, ttlMillis - 1L));
    }

    private void renewLock(WorkflowRuntimeLockLease lease, AtomicBoolean lockLost) {
        try {
            if (!workflowRuntimeLock.renew(lease)) {
                lockLost.set(true);
                log.warn("workflow runtime lock renew rejected, workflowId={}", lease.workflowId());
            }
        } catch (RuntimeException exception) {
            lockLost.set(true);
            log.warn("workflow runtime lock renew failed, workflowId={}, reason={}",
                    lease.workflowId(), exception.getMessage());
        }
    }

    private void ensureLockHealthy() {
        AtomicBoolean lockLost = activeLockLost.get();
        if (lockLost != null && lockLost.get()) {
            throw new IllegalStateException("workflow runtime lock was lost during execution");
        }
    }

    private void releaseLock(WorkflowRuntimeLockLease lease) {
        try {
            if (!workflowRuntimeLock.release(lease)) {
                log.warn("workflow runtime lock release rejected, workflowId={}", lease.workflowId());
            }
        } catch (RuntimeException exception) {
            log.warn("workflow runtime lock release failed, workflowId={}, reason={}",
                    lease.workflowId(), exception.getMessage());
        }
    }

    private boolean executeDag(WorkflowRuntimeRequest request,
                            WorkflowDag dag,
                            DefaultWorkflowContext context,
                            ExecutionTracker tracker) {
        ExecutorService executorService = Executors.newFixedThreadPool(workerCount(dag.nodeCount()));
        CompletionService<NodeExecution> completionService = new ExecutorCompletionService<>(executorService);
        Map<String, Integer> remainingPredecessors = remainingPredecessors(dag, tracker, context);
        Map<String, Integer> nodeDepths = dag.topologicalDepths();
        Map<String, VariableWriter> variableWriters = new HashMap<>();
        Queue<String> readyQueue = initialReadyNodes(dag, tracker, remainingPredecessors);
        Set<String> scheduled = new LinkedHashSet<>(tracker.completedNodeIds());
        scheduled.addAll(tracker.skippedNodeIds());
        Set<String> expectedNodeIds = new LinkedHashSet<>(readyQueue);
        int inFlight = 0;
        Long userId = AuthenticatedUserContext.userIdOrNull();
        String username = AuthenticatedUserContext.usernameOrNull();

        try {
            inFlight = submitReadyNodes(request, dag, context, completionService, readyQueue, scheduled, tracker, inFlight, userId, username);
            saveSnapshot(request, context, tracker);
            while (inFlight > 0) {
                NodeExecution execution = awaitCompletedNode(completionService);
                inFlight--;
                recordCompletedNode(request, context, tracker, execution, nodeDepths, variableWriters);

                if (!execution.result().waiting()) {
                    markUnselectedBranches(dag, execution, tracker, remainingPredecessors,
                            readyQueue, scheduled, expectedNodeIds);
                    for (String nextNodeId : dag.nextNodeIds(execution.nodeId(), execution.result())) {
                        expectedNodeIds.add(nextNodeId);
                        int remaining = decrementRemaining(remainingPredecessors, nextNodeId);
                        if (remaining == 0 && !scheduled.contains(nextNodeId)) {
                            readyQueue.add(nextNodeId);
                        }
                    }
                }
                inFlight = submitReadyNodes(request, dag, context, completionService, readyQueue, scheduled, tracker, inFlight, userId, username);
                saveSnapshot(request, context, tracker);
            }
            assertExpectedNodesCompleted(expectedNodeIds, tracker);
            return tracker.hasWaitingNodes();
        } finally {
            executorService.shutdownNow();
        }
    }

    private void assertExpectedNodesCompleted(Set<String> expectedNodeIds, ExecutionTracker tracker) {
        Set<String> completedNodeIds = Set.copyOf(tracker.completedNodeIds());
        List<String> incompleteNodeIds = expectedNodeIds.stream()
                .filter(nodeId -> !completedNodeIds.contains(nodeId)
                        && !tracker.isWaiting(nodeId)
                        && !tracker.isSkipped(nodeId))
                .toList();
        if (!incompleteNodeIds.isEmpty()) {
            throw new IllegalStateException("workflow runtime completed with incomplete expected nodes: " + incompleteNodeIds);
        }
    }

    private int submitReadyNodes(WorkflowRuntimeRequest request,
                                 WorkflowDag dag,
                                 DefaultWorkflowContext context,
                                 CompletionService<NodeExecution> completionService,
                                 Queue<String> readyQueue,
                                 Set<String> scheduled,
                                 ExecutionTracker tracker,
                                 int inFlight,
                                 Long userId,
                                 String username) {
        int submittedCount = inFlight;
        while (!readyQueue.isEmpty()) {
            String nodeId = readyQueue.remove();
            if (!scheduled.add(nodeId)) {
                continue;
            }
            tracker.markInFlight(nodeId);
            completionService.submit(() -> {
                return AuthenticatedUserContext.runAs(userId, username, () -> {
                    try {
                        return executeNode(request, dag, context, nodeId);
                    } catch (RuntimeException exception) {
                        tracker.markFailed(nodeId);
                        // Snapshot persistence is owned by the coordinator thread.
                        // Writing from worker threads races with a newer completion
                        // and can roll the durable runtime state backwards.
                        throw new NodeExecutionException(nodeId, exception);
                    }
                });
            });
            submittedCount++;
        }
        return submittedCount;
    }

    private NodeExecution executeNode(WorkflowRuntimeRequest request,
                                      WorkflowDag dag,
                                      DefaultWorkflowContext context,
                                      String nodeId) {
        WorkflowNodeDTO node = dag.node(nodeId);
        context.updateCurrentNodeId(nodeId);
        RuntimeLogContext.run(context, nodeId,
                () -> log.info("workflow node started, nodeType={}", node.getNodeType()));
        publish(context, RuntimeEventType.NODE_STARTED, nodeId, Map.of("nodeType", node.getNodeType()));
        NodeResult result = RuntimeLogContext.supply(context, nodeId,
                () -> {
                    if (hasNestedBody(node)) {
                        return executeNestedControlNode(request, context, node);
                    }
                    NodeExecutor executor = nodeRegistry.getRequired(NodeType.of(node.getNodeType()));
                    return executeNodeWithRetry(executor, context, request, nodeId, node.getNodeType());
                });
        return new NodeExecution(nodeId, node.getNodeType(), result);
    }

    private boolean hasNestedBody(WorkflowNodeDTO node) {
        if (!("ITERATION".equalsIgnoreCase(node.getNodeType())
                || "LOOP".equalsIgnoreCase(node.getNodeType()))) {
            return false;
        }
        Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
        return config.containsKey("bodyNodes") && config.get("bodyNodes") != null;
    }

    private NodeResult executeNestedControlNode(WorkflowRuntimeRequest request,
                                                DefaultWorkflowContext context,
                                                WorkflowNodeDTO controlNode) {
        Map<String, Object> config = controlNode.getConfig() == null ? Map.of() : controlNode.getConfig();
        List<WorkflowNodeDTO> bodyNodes = nestedBodyNodes(config.get("bodyNodes"), controlNode.getNodeId());
        if (bodyNodes.isEmpty()) {
            NodeExecutor executor = nodeRegistry.getRequired(NodeType.of(controlNode.getNodeType()));
            return executeNodeWithRetry(executor, context, request, controlNode.getNodeId(), controlNode.getNodeType());
        }
        if ("ITERATION".equalsIgnoreCase(controlNode.getNodeType())) {
            return executeNestedIteration(request, context, controlNode, config, bodyNodes);
        }
        return executeNestedLoop(request, context, controlNode, config, bodyNodes);
    }

    private NodeResult executeNestedIteration(WorkflowRuntimeRequest request,
                                              DefaultWorkflowContext context,
                                              WorkflowNodeDTO controlNode,
                                              Map<String, Object> config,
                                              List<WorkflowNodeDTO> bodyNodes) {
        String inputVariable = textValue(config.get("inputVariable"), "items");
        String itemVariable = textValue(config.get("itemVariable"), "item");
        String outputVariable = textValue(config.get("outputVariable"), "iterationItems");
        List<Object> items = listValue(config.containsKey("input") ? config.get("input") : context.variables().get(inputVariable));
        int requestedLimit = integerValue(config.get("maxIterations"), items.size());
        int limit = boundedCount(requestedLimit);
        List<Map<String, Object>> results = new ArrayList<>();
        for (int index = 0; index < Math.min(items.size(), limit); index++) {
            Object item = items.get(index);
            Map<String, Object> variables = new LinkedHashMap<>(context.variables());
            variables.put(itemVariable, item);
            variables.put("iterationIndex", index);
            Map<String, Object> bodyVariables = executeNestedBody(
                    request, context, controlNode, bodyNodes, variables,
                    "iteration-" + index);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("item", item);
            result.put("variables", Map.copyOf(bodyVariables));
            results.add(Map.copyOf(result));
        }
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("items", items.subList(0, Math.min(items.size(), limit)));
        output.put("results", results);
        output.put("count", results.size());
        output.put("truncated", results.size() < items.size());
        return new NodeResult(true, false, output, Map.of(outputVariable, List.copyOf(results)), null, null);
    }

    private NodeResult executeNestedLoop(WorkflowRuntimeRequest request,
                                         DefaultWorkflowContext context,
                                         WorkflowNodeDTO controlNode,
                                         Map<String, Object> config,
                                         List<WorkflowNodeDTO> bodyNodes) {
        String inputVariable = textValue(config.get("inputVariable"), "state");
        String outputVariable = textValue(config.get("outputVariable"), "loopState");
        String stopWhen = textValue(config.get("stopWhen"), "");
        Object state = config.containsKey("input") ? config.get("input") : context.variables().get(inputVariable);
        int limit = boundedCount(integerValue(config.get("maxIterations"), 1));
        int iterations = 0;
        boolean stopped = matchesStopCondition(state, stopWhen);
        while (!stopped && iterations < limit) {
            Map<String, Object> variables = new LinkedHashMap<>(context.variables());
            variables.put(inputVariable, state);
            variables.put("loopIteration", iterations);
            Map<String, Object> bodyVariables = executeNestedBody(
                    request, context, controlNode, bodyNodes, variables,
                    "loop-" + iterations);
            if (bodyVariables.containsKey(outputVariable)) {
                state = bodyVariables.get(outputVariable);
            } else if (bodyVariables.containsKey(inputVariable)) {
                state = bodyVariables.get(inputVariable);
            }
            iterations++;
            stopped = matchesStopCondition(state, stopWhen);
        }
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("state", state == null ? "" : state);
        output.put("iterations", iterations);
        output.put("stopped", stopped);
        output.put("bounded", iterations >= limit && !stopped);
        return new NodeResult(true, false, output, Map.of(outputVariable, state == null ? "" : state), null, null);
    }

    private Map<String, Object> executeNestedBody(WorkflowRuntimeRequest request,
                                                   DefaultWorkflowContext parentContext,
                                                   WorkflowNodeDTO controlNode,
                                                   List<WorkflowNodeDTO> bodyNodes,
                                                   Map<String, Object> initialVariables,
                                                   String scope) {
        Map<String, Object> variables = new LinkedHashMap<>(initialVariables);
        Map<String, Object> bodyConfigs = new LinkedHashMap<>();
        for (WorkflowNodeDTO bodyNode : bodyNodes) {
            bodyConfigs.put(bodyNode.getNodeId(), bodyNode.getConfig() == null ? Map.of() : bodyNode.getConfig());
        }
        variables.put(WorkflowNodeContextKeys.NODE_CONFIGS, bodyConfigs);
        Map<String, Object> bodyVariables = new LinkedHashMap<>();
        for (WorkflowNodeDTO bodyNode : bodyNodes) {
            String bodyNodeId = controlNode.getNodeId() + "/" + scope + "/" + bodyNode.getNodeId();
            DefaultWorkflowContext bodyContext = new DefaultWorkflowContext(
                    parentContext.workflowId(), parentContext.traceId(),
                    parentContext.taskId() + ":" + scope, variables);
            bodyContext.updateRuntimeState(RuntimeState.RUNNING);
            bodyContext.updateCurrentNodeId(bodyNode.getNodeId());
            publish(parentContext, RuntimeEventType.NODE_STARTED, bodyNodeId,
                    Map.of("nodeType", bodyNode.getNodeType(), "nested", true,
                            "parentNodeId", controlNode.getNodeId()));
            NodeResult result = hasNestedBody(bodyNode)
                    ? executeNestedControlNode(request, bodyContext, bodyNode)
                    : executeNodeWithRetry(
                    nodeRegistry.getRequired(NodeType.of(bodyNode.getNodeType())),
                    bodyContext,
                    request,
                    bodyNodeId,
                    bodyNode.getNodeType());
            if (result.waiting()) {
                throw new IllegalStateException("nested control body cannot wait for external completion: " + bodyNodeId);
            }
            if (!result.successful()) {
                throw new IllegalStateException("nested control body failed: " + bodyNodeId);
            }
            bodyVariables.putAll(result.variables());
            variables.putAll(result.variables());
            publish(parentContext, RuntimeEventType.NODE_COMPLETED, bodyNodeId,
                    Map.of("nodeType", bodyNode.getNodeType(), "nested", true,
                            "parentNodeId", controlNode.getNodeId()));
        }
        return Map.copyOf(bodyVariables);
    }

    private List<WorkflowNodeDTO> nestedBodyNodes(Object rawBodyNodes, String controlNodeId) {
        if (!(rawBodyNodes instanceof Collection<?> collection)) {
            throw new IllegalArgumentException("bodyNodes must be an array for control node " + controlNodeId);
        }
        if (collection.size() > MAX_NESTED_BODY_NODES) {
            throw new IllegalArgumentException("bodyNodes exceeds maximum of " + MAX_NESTED_BODY_NODES
                    + " for control node " + controlNodeId);
        }
        List<WorkflowNodeDTO> nodes = new ArrayList<>();
        Set<String> ids = new LinkedHashSet<>();
        int index = 0;
        for (Object rawNode : collection) {
            if (!(rawNode instanceof Map<?, ?> rawMap)) {
                throw new IllegalArgumentException("bodyNodes[" + index + "] must be an object");
            }
            WorkflowNodeDTO node = new WorkflowNodeDTO();
            node.setNodeId(textValue(rawMap.get("nodeId"), "body-node-" + index));
            node.setNodeType(textValue(rawMap.get("nodeType"), ""));
            if (node.getNodeType().isBlank()) {
                throw new IllegalArgumentException("bodyNodes[" + index + "] nodeType is required");
            }
            if (!ids.add(node.getNodeId())) {
                throw new IllegalArgumentException("duplicate nested body node id: " + node.getNodeId());
            }
            node.setDisplayName(textValue(rawMap.get("displayName"), node.getNodeId()));
            node.setConfig(objectMap(rawMap.get("config")));
            nodes.add(node);
            index++;
        }
        return List.copyOf(nodes);
    }

    private int boundedCount(int requestedCount) {
        return Math.min(Math.max(requestedCount, 0), MAX_NESTED_ITERATIONS);
    }

    private int integerValue(Object value, int fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private List<Object> listValue(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof Collection<?> collection) {
            return List.copyOf(collection);
        }
        String text = String.valueOf(value);
        if (text.isBlank()) {
            return List.of();
        }
        return List.of(text.split(",")).stream().map(String::trim).filter(item -> !item.isBlank()).map(item -> (Object) item).toList();
    }

    private boolean matchesStopCondition(Object state, String stopWhen) {
        if (stopWhen.isBlank() || state == null) {
            return false;
        }
        if (state instanceof Map<?, ?> stateMap && stateMap.containsKey(stopWhen)) {
            Object marker = stateMap.get(stopWhen);
            if (marker instanceof Boolean booleanMarker) {
                return booleanMarker;
            }
            if (marker instanceof Number numberMarker) {
                return numberMarker.doubleValue() != 0;
            }
            return marker != null && !String.valueOf(marker).isBlank();
        }
        return String.valueOf(state).contains(stopWhen);
    }

    private String textValue(Object value, String fallback) {
        String text = value == null ? "" : String.valueOf(value).trim();
        return text.isBlank() ? fallback : text;
    }

    private Map<String, Object> objectMap(Object value) {
        if (!(value instanceof Map<?, ?> source)) {
            return Map.of();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        source.forEach((key, item) -> result.put(String.valueOf(key), item));
        return Map.copyOf(result);
    }

    private NodeExecution awaitCompletedNode(CompletionService<NodeExecution> completionService) {
        try {
            return completionService.take().get();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("workflow runtime interrupted", exception);
        } catch (ExecutionException exception) {
            if (exception.getCause() instanceof NodeExecutionException nodeExecutionException) {
                throw nodeExecutionException.failure();
            }
            throw toRuntimeException(exception.getCause());
        }
    }

    private void recordCompletedNode(WorkflowRuntimeRequest request,
                                     DefaultWorkflowContext context,
                                     ExecutionTracker tracker,
                                     NodeExecution execution,
                                     Map<String, Integer> nodeDepths,
                                     Map<String, VariableWriter> variableWriters) {
        context.recordNodeOutput(execution.nodeId(), execution.result());
        if (execution.result().waiting()) {
            tracker.markWaiting(execution.nodeId());
            publish(context, RuntimeEventType.NODE_WAITING, execution.nodeId(), execution.result().output());
            saveSnapshot(request, context, tracker);
            return;
        }
        mergeVariables(context, execution.nodeId(), execution.result().variables(), nodeDepths, variableWriters);
        tracker.markCompleted(execution.nodeId());
        RuntimeLogContext.run(context, execution.nodeId(),
                () -> log.info("workflow node completed, nodeType={}", execution.nodeType()));
        publish(context, RuntimeEventType.NODE_COMPLETED, execution.nodeId(), Map.of("nodeType", execution.nodeType()));
        saveSnapshot(request, context, tracker);
    }

    private void mergeVariables(DefaultWorkflowContext context,
                                String nodeId,
                                Map<String, Object> variables,
                                Map<String, Integer> nodeDepths,
                                Map<String, VariableWriter> variableWriters) {
        int currentDepth = nodeDepths.getOrDefault(nodeId, 0);
        variables.forEach((name, value) -> {
            VariableWriter previous = variableWriters.get(name);
            if (previous == null
                    || currentDepth > previous.depth()
                    || (currentDepth == previous.depth() && nodeId.compareTo(previous.nodeId()) < 0)) {
                context.variables().put(name, value);
                variableWriters.put(name, new VariableWriter(nodeId, currentDepth));
            }
        });
    }

    private void markUnselectedBranches(WorkflowDag dag,
                                        NodeExecution execution,
                                        ExecutionTracker tracker,
                                        Map<String, Integer> remainingPredecessors,
                                        Queue<String> readyQueue,
                                        Set<String> scheduled,
                                        Set<String> expectedNodeIds) {
        if (!hasDynamicNext(execution.result())) {
            return;
        }
        Set<String> selected = Set.copyOf(dag.nextNodeIds(execution.nodeId(), execution.result()));
        for (String candidate : dag.declaredNextNodeIds(execution.nodeId())) {
            if (!selected.contains(candidate)) {
                markSkippedNode(dag, candidate, execution.nodeId(), tracker, remainingPredecessors,
                        readyQueue, scheduled, expectedNodeIds);
            }
        }
    }

    private boolean hasDynamicNext(NodeResult result) {
        return result.nextNodeId() != null || result.branchKey() != null;
    }

    private void markSkippedNode(WorkflowDag dag,
                                 String nodeId,
                                 String skippedPredecessor,
                                 ExecutionTracker tracker,
                                 Map<String, Integer> remainingPredecessors,
                                 Queue<String> readyQueue,
                                 Set<String> scheduled,
                                 Set<String> expectedNodeIds) {
        if (tracker.isCompleted(nodeId) || tracker.isWaiting(nodeId) || tracker.isInFlight(nodeId)
                || tracker.isSkipped(nodeId)) {
            return;
        }
        if (dag.predecessorNodeIds(nodeId).stream()
                .anyMatch(predecessor -> !predecessor.equals(skippedPredecessor)
                        && !tracker.isSkipped(predecessor))) {
            return;
        }
        tracker.markSkipped(nodeId);
        scheduled.add(nodeId);
        expectedNodeIds.remove(nodeId);
        for (String nextNodeId : dag.declaredNextNodeIds(nodeId)) {
            int remaining = decrementRemaining(remainingPredecessors, nextNodeId);
            if (remaining == 0 && !tracker.isCompleted(nextNodeId)
                    && !tracker.isWaiting(nextNodeId) && !tracker.isInFlight(nextNodeId)
                    && !tracker.isSkipped(nextNodeId)) {
                if (allPredecessorsSkipped(dag, nextNodeId, tracker)) {
                    markSkippedNode(dag, nextNodeId, nodeId, tracker, remainingPredecessors,
                            readyQueue, scheduled, expectedNodeIds);
                } else {
                    expectedNodeIds.add(nextNodeId);
                    readyQueue.add(nextNodeId);
                }
            }
        }
    }

    private boolean allPredecessorsSkipped(WorkflowDag dag, String nodeId, ExecutionTracker tracker) {
        List<String> predecessors = dag.predecessorNodeIds(nodeId);
        return !predecessors.isEmpty() && predecessors.stream().allMatch(tracker::isSkipped);
    }

    private int decrementRemaining(Map<String, Integer> remainingPredecessors, String nodeId) {
        return remainingPredecessors.compute(nodeId, (ignored, current) -> {
            int currentCount = current == null ? 0 : current;
            return Math.max(0, currentCount - 1);
        });
    }

    private Map<String, Integer> remainingPredecessors(WorkflowDag dag,
                                                       ExecutionTracker tracker,
                                                       DefaultWorkflowContext context) {
        Map<String, Integer> remainingPredecessors = new HashMap<>();
        for (String nodeId : dag.nodeIds()) {
            remainingPredecessors.put(nodeId, dag.requiredPredecessorCount(nodeId));
        }
        for (String completedNodeId : tracker.completedNodeIds()) {
            NodeResult completedResult = context.nodeOutputs().get(completedNodeId);
            if (completedResult == null) {
                completedResult = NodeResult.success(Map.of());
            }
            for (String nextNodeId : dag.nextNodeIds(completedNodeId, completedResult)) {
                decrementRemaining(remainingPredecessors, nextNodeId);
            }
        }
        for (String skippedNodeId : tracker.skippedNodeIds()) {
            for (String nextNodeId : dag.declaredNextNodeIds(skippedNodeId)) {
                decrementRemaining(remainingPredecessors, nextNodeId);
            }
        }
        return remainingPredecessors;
    }

    private void replaySkippedBranches(WorkflowDag dag,
                                       DefaultWorkflowContext context,
                                       ExecutionTracker tracker) {
        for (String completedNodeId : tracker.completedNodeIds()) {
            NodeResult result = context.nodeOutputs().get(completedNodeId);
            if (result == null || result.waiting() || !hasDynamicNext(result)) {
                continue;
            }
            Set<String> selected = Set.copyOf(dag.nextNodeIds(completedNodeId, result));
            for (String candidate : dag.declaredNextNodeIds(completedNodeId)) {
                if (!selected.contains(candidate)) {
                    replaySkippedNode(dag, candidate, completedNodeId, tracker);
                }
            }
        }
    }

    private void replaySkippedNode(WorkflowDag dag,
                                   String nodeId,
                                   String skippedPredecessor,
                                   ExecutionTracker tracker) {
        if (tracker.isCompleted(nodeId) || tracker.isWaiting(nodeId)
                || tracker.isInFlight(nodeId) || tracker.isSkipped(nodeId)) {
            return;
        }
        if (dag.predecessorNodeIds(nodeId).stream()
                .anyMatch(predecessor -> !predecessor.equals(skippedPredecessor)
                        && !tracker.isSkipped(predecessor))) {
            return;
        }
        tracker.markSkipped(nodeId);
        for (String nextNodeId : dag.declaredNextNodeIds(nodeId)) {
            if (allPredecessorsSkipped(dag, nextNodeId, tracker)) {
                replaySkippedNode(dag, nextNodeId, nodeId, tracker);
            }
        }
    }

    private Queue<String> initialReadyNodes(WorkflowDag dag,
                                            ExecutionTracker tracker,
                                            Map<String, Integer> remainingPredecessors) {
        Queue<String> readyQueue = new ArrayDeque<>();
        Set<String> completedNodeIds = Set.copyOf(tracker.completedNodeIds());
        for (String nodeId : dag.nodeIds()) {
            if (!completedNodeIds.contains(nodeId)
                    && !tracker.isSkipped(nodeId)
                    && !tracker.isWaiting(nodeId)
                    && remainingPredecessors.getOrDefault(nodeId, 0) == 0) {
                readyQueue.add(nodeId);
            }
        }
        return readyQueue;
    }

    private int workerCount(int nodeCount) {
        if (nodeCount <= 1) {
            return 1;
        }
        int availableProcessors = Runtime.getRuntime().availableProcessors();
        return Math.min(nodeCount, Math.max(2, availableProcessors));
    }

    private NodeResult executeNodeWithRetry(NodeExecutor executor,
                                            DefaultWorkflowContext context,
                                            WorkflowRuntimeRequest request,
                                            String nodeId,
                                            String nodeType) {
        int attempt = 1;
        while (true) {
            try {
                NodeResult result = executor.execute(context);
                return result == null ? NodeResult.success(Map.of()) : result;
            } catch (NodeWaitingException waitingException) {
                return NodeResult.waiting(waitingException.output());
            } catch (Exception exception) {
                RuntimeException runtimeException = toRuntimeException(exception);
                if (!request.retryPolicy().shouldRetry(attempt, runtimeException)) {
                    throw runtimeException;
                }
                int currentAttempt = attempt;
                context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.RETRYING));
                RuntimeLogContext.run(context, nodeId,
                        () -> log.warn("workflow node retrying, nodeType={}, attempt={}, reason={}",
                                nodeType, currentAttempt, errorMessage(runtimeException)));
                publish(context, RuntimeEventType.NODE_RETRYING, nodeId,
                        Map.of("nodeType", nodeType, "attempt", currentAttempt, "error", errorMessage(runtimeException)));
                sleepBeforeRetry(request, currentAttempt);
                context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.RUNNING));
                attempt++;
            }
        }
    }

    private void sleepBeforeRetry(WorkflowRuntimeRequest request, int attempt) {
        try {
            runtimeSleeper.sleep(request.retryPolicy().delayForAttempt(attempt));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("runtime retry sleep interrupted", exception);
        }
    }

    private RuntimeException toRuntimeException(Exception exception) {
        if (exception instanceof RuntimeException runtimeException) {
            return runtimeException;
        }
        return new IllegalStateException("node execution failed", exception);
    }

    private RuntimeException toRuntimeException(Throwable throwable) {
        if (throwable instanceof RuntimeException runtimeException) {
            return runtimeException;
        }
        if (throwable instanceof Exception exception) {
            return toRuntimeException(exception);
        }
        return new IllegalStateException("node execution failed", throwable);
    }

    private String errorMessage(RuntimeException exception) {
        return exception.getMessage() == null ? exception.getClass().getName() : exception.getMessage();
    }

    private DefaultWorkflowContext contextFromSnapshot(WorkflowExecutionSnapshot snapshot) {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                snapshot.workflowId(),
                snapshot.traceId(),
                snapshot.taskId(),
                snapshot.variables()
        );
        context.updateRuntimeState(snapshot.runtimeState());
        context.updateCurrentNodeId(snapshot.currentNodeId());
        snapshot.nodeOutputs().forEach(context::recordNodeOutput);
        return context;
    }

    private WorkflowExecutionSnapshot snapshot(DefaultWorkflowContext context, ExecutionTracker tracker) {
        List<String> currentNodeIds = tracker.currentNodeIds();
        return new WorkflowExecutionSnapshot(
                context.workflowId(),
                context.traceId(),
                context.taskId(),
                context.runtimeState(),
                currentNodeIds.isEmpty() ? context.currentNodeId() : currentNodeIds.get(currentNodeIds.size() - 1),
                currentNodeIds,
                context.variables(),
                context.nodeOutputs(),
                tracker.completedNodeIds(),
                tracker.failedNodeIds()
        );
    }

    private void saveSnapshot(WorkflowRuntimeRequest request,
                              DefaultWorkflowContext context,
                              ExecutionTracker tracker) {
        ensureLockHealthy();
        snapshotRepository.save(WorkflowRuntimeSnapshot.fromExecution(
                context.workflowId(),
                context.traceId(),
                context.taskId(),
                request.definitionId(),
                request.definition(),
                snapshot(context, tracker),
                tracker.currentNodeIds(),
                tracker.failedNodeIds()
        ));
    }

    private void publish(DefaultWorkflowContext context,
                         RuntimeEventType eventType,
                         String nodeId,
                         Map<String, Object> attributes) {
        eventPublisher.publish(RuntimeEvent.of(
                eventType,
                context.workflowId(),
                context.traceId(),
                context.taskId(),
                nodeId,
                context.runtimeState(),
                Instant.now(),
                attributes
        ));
    }

    private record NodeExecution(String nodeId, String nodeType, NodeResult result) {
    }

    private record VariableWriter(String nodeId, int depth) {
    }

    private static final class NodeExecutionException extends RuntimeException {

        private final String nodeId;
        private final RuntimeException failure;

        private NodeExecutionException(String nodeId, RuntimeException failure) {
            super(failure);
            this.nodeId = nodeId;
            this.failure = failure;
        }

        String nodeId() {
            return nodeId;
        }

        RuntimeException failure() {
            return failure;
        }
    }

    private static final class ExecutionTracker {

        private final Set<String> inFlightNodeIds = ConcurrentHashMap.newKeySet();
        private final Set<String> waitingNodeIds = ConcurrentHashMap.newKeySet();
        private final Set<String> skippedNodeIds = ConcurrentHashMap.newKeySet();
        private final List<String> completedNodeIds = Collections.synchronizedList(new ArrayList<>());
        private final List<String> failedNodeIds = Collections.synchronizedList(new ArrayList<>());

        static ExecutionTracker empty() {
            return new ExecutionTracker();
        }

        static ExecutionTracker from(WorkflowExecutionSnapshot snapshot) {
            ExecutionTracker tracker = new ExecutionTracker();
            tracker.completedNodeIds.addAll(snapshot.completedNodeIds());
            tracker.failedNodeIds.addAll(snapshot.failedNodeIds());
            snapshot.nodeOutputs().forEach((nodeId, result) -> {
                if (result.waiting() && !tracker.completedNodeIds.contains(nodeId)) {
                    tracker.waitingNodeIds.add(nodeId);
                }
            });
            return tracker;
        }

        void markInFlight(String nodeId) {
            inFlightNodeIds.add(nodeId);
        }

        void markCompleted(String nodeId) {
            inFlightNodeIds.remove(nodeId);
            waitingNodeIds.remove(nodeId);
            skippedNodeIds.remove(nodeId);
            failedNodeIds.remove(nodeId);
            if (!completedNodeIds.contains(nodeId)) {
                completedNodeIds.add(nodeId);
            }
        }

        void markFailed(String nodeId) {
            inFlightNodeIds.remove(nodeId);
            waitingNodeIds.remove(nodeId);
            if (!failedNodeIds.contains(nodeId)) {
                failedNodeIds.add(nodeId);
            }
        }

        void markWaiting(String nodeId) {
            inFlightNodeIds.remove(nodeId);
            waitingNodeIds.add(nodeId);
        }

        void markSkipped(String nodeId) {
            inFlightNodeIds.remove(nodeId);
            waitingNodeIds.remove(nodeId);
            skippedNodeIds.add(nodeId);
        }

        boolean isCompleted(String nodeId) {
            synchronized (completedNodeIds) {
                return completedNodeIds.contains(nodeId);
            }
        }

        boolean isInFlight(String nodeId) {
            return inFlightNodeIds.contains(nodeId);
        }

        boolean isSkipped(String nodeId) {
            return skippedNodeIds.contains(nodeId);
        }

        List<String> skippedNodeIds() {
            List<String> skipped = new ArrayList<>(skippedNodeIds);
            skipped.sort(String::compareTo);
            return List.copyOf(skipped);
        }

        boolean isWaiting(String nodeId) {
            return waitingNodeIds.contains(nodeId);
        }

        boolean hasWaitingNodes() {
            return !waitingNodeIds.isEmpty();
        }

        List<String> currentNodeIds() {
            List<String> current = new ArrayList<>(inFlightNodeIds);
            current.addAll(waitingNodeIds);
            current.sort(String::compareTo);
            return List.copyOf(current);
        }

        List<String> completedNodeIds() {
            synchronized (completedNodeIds) {
                return List.copyOf(completedNodeIds);
            }
        }

        List<String> failedNodeIds() {
            synchronized (failedNodeIds) {
                return List.copyOf(failedNodeIds);
            }
        }
    }
}
