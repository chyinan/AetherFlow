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
import lombok.extern.slf4j.Slf4j;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Queue;
import java.util.Set;

@Slf4j
public class WorkflowRuntimeEngine {

    private final NodeRegistry nodeRegistry;
    private final RuntimeStateMachine stateMachine;
    private final RuntimeEventPublisher eventPublisher;
    private final RuntimeSleeper runtimeSleeper;

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
        this.nodeRegistry = Objects.requireNonNull(nodeRegistry, "nodeRegistry must not be null");
        this.stateMachine = Objects.requireNonNull(stateMachine, "stateMachine must not be null");
        this.eventPublisher = Objects.requireNonNull(eventPublisher, "eventPublisher must not be null");
        this.runtimeSleeper = Objects.requireNonNull(runtimeSleeper, "runtimeSleeper must not be null");
    }

    public WorkflowExecutionSnapshot execute(WorkflowRuntimeRequest request) {
        Objects.requireNonNull(request, "request must not be null");
        WorkflowDag dag = WorkflowDag.from(request.definition());
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                request.workflowId(),
                request.traceId(),
                request.taskId(),
                request.variables()
        );
        context.updateRuntimeState(stateMachine.transition(RuntimeState.PENDING, RuntimeState.RUNNING));
        RuntimeLogContext.run(context, null,
                () -> log.info("workflow runtime started, totalNodes={}", dag.nodeCount()));
        publish(context, RuntimeEventType.WORKFLOW_STARTED, null, Map.of("totalNodes", dag.nodeCount()));

        List<String> completedNodeIds = new ArrayList<>();
        Queue<String> readyQueue = new ArrayDeque<>();
        Set<String> scheduledOrCompleted = new LinkedHashSet<>();
        readyQueue.add(dag.startNodeId());
        scheduledOrCompleted.add(dag.startNodeId());

        try {
            while (!readyQueue.isEmpty()) {
                String nodeId = readyQueue.remove();
                WorkflowNodeDTO node = dag.node(nodeId);
                context.updateCurrentNodeId(nodeId);
                NodeExecutor executor = nodeRegistry.getRequired(NodeType.of(node.getNodeType()));
                RuntimeLogContext.run(context, nodeId,
                        () -> log.info("workflow node started, nodeType={}", node.getNodeType()));
                publish(context, RuntimeEventType.NODE_STARTED, nodeId, Map.of("nodeType", node.getNodeType()));
                NodeResult result = RuntimeLogContext.supply(context, nodeId,
                        () -> executeNodeWithRetry(executor, context, request, nodeId, node.getNodeType()));
                context.recordNodeOutput(nodeId, result);
                context.variables().putAll(result.variables());
                completedNodeIds.add(nodeId);
                RuntimeLogContext.run(context, nodeId,
                        () -> log.info("workflow node completed, nodeType={}", node.getNodeType()));
                publish(context, RuntimeEventType.NODE_COMPLETED, nodeId, Map.of("nodeType", node.getNodeType()));

                for (String nextNodeId : dag.nextNodeIds(nodeId, result)) {
                    if (scheduledOrCompleted.add(nextNodeId)) {
                        readyQueue.add(nextNodeId);
                    }
                }
            }
            context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.SUCCESS));
            RuntimeLogContext.run(context, context.currentNodeId(),
                    () -> log.info("workflow runtime completed, completedNodes={}", completedNodeIds.size()));
            publish(context, RuntimeEventType.WORKFLOW_COMPLETED, context.currentNodeId(), Map.of());
            return snapshot(context, completedNodeIds);
        } catch (RuntimeException exception) {
            if (!stateMachine.isTerminal(context.runtimeState())) {
                context.updateRuntimeState(stateMachine.transition(context.runtimeState(), RuntimeState.FAILED));
            }
            RuntimeLogContext.run(context, context.currentNodeId(),
                    () -> log.error("workflow runtime failed, reason={}", exception.getMessage(), exception));
            publish(context, RuntimeEventType.WORKFLOW_FAILED, context.currentNodeId(),
                    Map.of("error", exception.getMessage() == null ? exception.getClass().getName() : exception.getMessage()));
            throw exception;
        }
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
                                nodeType, currentAttempt, runtimeException.getMessage()));
                publish(context, RuntimeEventType.NODE_RETRYING, nodeId,
                        Map.of("nodeType", nodeType, "attempt", currentAttempt, "error", runtimeException.getMessage()));
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

    private WorkflowExecutionSnapshot snapshot(DefaultWorkflowContext context, List<String> completedNodeIds) {
        return new WorkflowExecutionSnapshot(
                context.workflowId(),
                context.traceId(),
                context.taskId(),
                context.runtimeState(),
                context.currentNodeId(),
                context.variables(),
                context.nodeOutputs(),
                completedNodeIds
        );
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
}
