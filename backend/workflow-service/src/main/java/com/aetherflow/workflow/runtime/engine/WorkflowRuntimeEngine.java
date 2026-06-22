package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.dag.WorkflowDag;
import com.aetherflow.workflow.runtime.logging.RuntimeLogContext;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLockLease;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
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
import java.util.function.Supplier;

@Slf4j
public class WorkflowRuntimeEngine {

    private final NodeRegistry nodeRegistry;
    private final RuntimeStateMachine stateMachine;
    private final RuntimeEventPublisher eventPublisher;
    private final RuntimeSleeper runtimeSleeper;
    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowRuntimeLock workflowRuntimeLock;

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
            executeDag(request, dag, context, tracker);
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
        RuntimeLogContext.run(context, context.currentNodeId(),
                () -> log.info("workflow runtime recovering, completedNodes={}", tracker.completedNodeIds().size()));
        publish(context, RuntimeEventType.WORKFLOW_STARTED, context.currentNodeId(),
                Map.of("totalNodes", dag.nodeCount(), "recovered", true));
        saveSnapshot(request, context, tracker);

        try {
            executeDag(request, dag, context, tracker);
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
        ScheduledExecutorService renewalExecutor = startLockRenewal(lease);
        try {
            return execution.get();
        } finally {
            if (renewalExecutor != null) {
                renewalExecutor.shutdownNow();
            }
            releaseLock(lease);
        }
    }

    private ScheduledExecutorService startLockRenewal(WorkflowRuntimeLockLease lease) {
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
                () -> renewLock(lease),
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

    private void renewLock(WorkflowRuntimeLockLease lease) {
        try {
            if (!workflowRuntimeLock.renew(lease)) {
                log.warn("workflow runtime lock renew rejected, workflowId={}", lease.workflowId());
            }
        } catch (RuntimeException exception) {
            log.warn("workflow runtime lock renew failed, workflowId={}, reason={}",
                    lease.workflowId(), exception.getMessage());
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

    private void executeDag(WorkflowRuntimeRequest request,
                            WorkflowDag dag,
                            DefaultWorkflowContext context,
                            ExecutionTracker tracker) {
        ExecutorService executorService = Executors.newFixedThreadPool(workerCount(dag.nodeCount()));
        CompletionService<NodeExecution> completionService = new ExecutorCompletionService<>(executorService);
        Map<String, Integer> remainingPredecessors = remainingPredecessors(dag, tracker, context);
        Queue<String> readyQueue = initialReadyNodes(dag, tracker, remainingPredecessors);
        Set<String> scheduled = new LinkedHashSet<>(tracker.completedNodeIds());
        Set<String> expectedNodeIds = new LinkedHashSet<>(readyQueue);
        int inFlight = 0;

        try {
            inFlight = submitReadyNodes(request, dag, context, completionService, readyQueue, scheduled, tracker, inFlight);
            saveSnapshot(request, context, tracker);
            while (inFlight > 0) {
                NodeExecution execution = awaitCompletedNode(completionService);
                inFlight--;
                recordCompletedNode(request, context, tracker, execution);

                for (String nextNodeId : dag.nextNodeIds(execution.nodeId(), execution.result())) {
                    expectedNodeIds.add(nextNodeId);
                    int remaining = remainingPredecessors.compute(nextNodeId, (ignored, current) -> {
                        int currentCount = current == null ? 0 : current;
                        return Math.max(0, currentCount - 1);
                    });
                    if (remaining == 0 && !scheduled.contains(nextNodeId)) {
                        readyQueue.add(nextNodeId);
                    }
                }
                inFlight = submitReadyNodes(request, dag, context, completionService, readyQueue, scheduled, tracker, inFlight);
                saveSnapshot(request, context, tracker);
            }
            assertExpectedNodesCompleted(expectedNodeIds, tracker);
        } finally {
            executorService.shutdownNow();
        }
    }

    private void assertExpectedNodesCompleted(Set<String> expectedNodeIds, ExecutionTracker tracker) {
        Set<String> completedNodeIds = Set.copyOf(tracker.completedNodeIds());
        List<String> incompleteNodeIds = expectedNodeIds.stream()
                .filter(nodeId -> !completedNodeIds.contains(nodeId))
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
                                 int inFlight) {
        int submittedCount = inFlight;
        while (!readyQueue.isEmpty()) {
            String nodeId = readyQueue.remove();
            if (!scheduled.add(nodeId)) {
                continue;
            }
            tracker.markInFlight(nodeId);
            completionService.submit(() -> {
                try {
                    return executeNode(request, dag, context, nodeId);
                } catch (RuntimeException exception) {
                    tracker.markFailed(nodeId);
                    saveSnapshot(request, context, tracker);
                    throw new NodeExecutionException(nodeId, exception);
                }
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
        NodeExecutor executor = nodeRegistry.getRequired(NodeType.of(node.getNodeType()));
        RuntimeLogContext.run(context, nodeId,
                () -> log.info("workflow node started, nodeType={}", node.getNodeType()));
        publish(context, RuntimeEventType.NODE_STARTED, nodeId, Map.of("nodeType", node.getNodeType()));
        NodeResult result = RuntimeLogContext.supply(context, nodeId,
                () -> executeNodeWithRetry(executor, context, request, nodeId, node.getNodeType()));
        return new NodeExecution(nodeId, node.getNodeType(), result);
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
                                     NodeExecution execution) {
        context.recordNodeOutput(execution.nodeId(), execution.result());
        context.variables().putAll(execution.result().variables());
        tracker.markCompleted(execution.nodeId());
        RuntimeLogContext.run(context, execution.nodeId(),
                () -> log.info("workflow node completed, nodeType={}", execution.nodeType()));
        publish(context, RuntimeEventType.NODE_COMPLETED, execution.nodeId(), Map.of("nodeType", execution.nodeType()));
        saveSnapshot(request, context, tracker);
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
                remainingPredecessors.compute(nextNodeId, (ignored, current) -> {
                    int currentCount = current == null ? 0 : current;
                    return Math.max(0, currentCount - 1);
                });
            }
        }
        return remainingPredecessors;
    }

    private Queue<String> initialReadyNodes(WorkflowDag dag,
                                            ExecutionTracker tracker,
                                            Map<String, Integer> remainingPredecessors) {
        Queue<String> readyQueue = new ArrayDeque<>();
        Set<String> completedNodeIds = Set.copyOf(tracker.completedNodeIds());
        for (String nodeId : dag.nodeIds()) {
            if (!completedNodeIds.contains(nodeId)
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
        snapshotRepository.save(WorkflowRuntimeSnapshot.fromExecution(
                context.workflowId(),
                context.traceId(),
                context.taskId(),
                null,
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
        private final List<String> completedNodeIds = Collections.synchronizedList(new ArrayList<>());
        private final List<String> failedNodeIds = Collections.synchronizedList(new ArrayList<>());

        static ExecutionTracker empty() {
            return new ExecutionTracker();
        }

        static ExecutionTracker from(WorkflowExecutionSnapshot snapshot) {
            ExecutionTracker tracker = new ExecutionTracker();
            tracker.completedNodeIds.addAll(snapshot.completedNodeIds());
            tracker.failedNodeIds.addAll(snapshot.failedNodeIds());
            return tracker;
        }

        void markInFlight(String nodeId) {
            inFlightNodeIds.add(nodeId);
        }

        void markCompleted(String nodeId) {
            inFlightNodeIds.remove(nodeId);
            failedNodeIds.remove(nodeId);
            if (!completedNodeIds.contains(nodeId)) {
                completedNodeIds.add(nodeId);
            }
        }

        void markFailed(String nodeId) {
            inFlightNodeIds.remove(nodeId);
            if (!failedNodeIds.contains(nodeId)) {
                failedNodeIds.add(nodeId);
            }
        }

        List<String> currentNodeIds() {
            return List.copyOf(inFlightNodeIds);
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
