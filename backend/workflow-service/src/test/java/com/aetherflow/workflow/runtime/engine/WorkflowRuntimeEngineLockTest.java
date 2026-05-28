package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLockLease;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkflowRuntimeEngineLockTest {

    @Test
    void doesNotExecuteWorkflowWhenRuntimeLockIsAlreadyHeld() {
        AtomicInteger executions = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(executor("INPUT", context -> {
            executions.incrementAndGet();
            return NodeResult.success(Map.of());
        })));
        WorkflowRuntimeEngine engine = engine(registry, WorkflowRuntimeLock.alreadyHeld());

        assertThatThrownBy(() -> engine.execute(request()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("workflow runtime lock already held");
        assertThat(executions).hasValue(0);
    }

    @Test
    void releasesRuntimeLockAfterSuccessfulExecution() {
        RecordingWorkflowRuntimeLock lock = new RecordingWorkflowRuntimeLock();
        NodeRegistry registry = new NodeRegistry(List.of(executor("INPUT", context -> NodeResult.success(Map.of()))));
        WorkflowRuntimeEngine engine = engine(registry, lock);

        WorkflowExecutionSnapshot snapshot = engine.execute(request());

        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(lock.acquireCount).isEqualTo(1);
        assertThat(lock.releaseCount).isEqualTo(1);
    }

    @Test
    void releasesRuntimeLockAfterFailedExecution() {
        RecordingWorkflowRuntimeLock lock = new RecordingWorkflowRuntimeLock();
        NodeRegistry registry = new NodeRegistry(List.of(executor("INPUT", context -> {
            throw new IllegalStateException("boom");
        })));
        WorkflowRuntimeEngine engine = engine(registry, lock);

        assertThatThrownBy(() -> engine.execute(request()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("boom");
        assertThat(lock.acquireCount).isEqualTo(1);
        assertThat(lock.releaseCount).isEqualTo(1);
    }

    private static WorkflowRuntimeEngine engine(NodeRegistry registry, WorkflowRuntimeLock lock) {
        return new WorkflowRuntimeEngine(
                registry,
                new RuntimeStateMachine(),
                event -> {
                },
                RuntimeSleeper.noop(),
                RuntimeSnapshotRepository.noop(),
                lock
        );
    }

    private static WorkflowRuntimeRequest request() {
        return new WorkflowRuntimeRequest(
                "workflow-1",
                "trace-1",
                "task-1",
                definition(),
                Map.of(),
                RetryPolicy.none()
        );
    }

    private static WorkflowDefinitionDTO definition() {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("lock-test");
        definition.setNodes(List.of(node("node-input", "INPUT", Map.of())));
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

    private static NodeExecutor executor(String nodeType, NodeBehavior behavior) {
        return new NodeExecutor() {
            @Override
            public NodeType nodeType() {
                return NodeType.of(nodeType);
            }

            @Override
            public NodeResult execute(WorkflowContext context) throws Exception {
                return behavior.execute(context);
            }
        };
    }

    private interface NodeBehavior {

        NodeResult execute(WorkflowContext context) throws Exception;
    }

    private static final class RecordingWorkflowRuntimeLock implements WorkflowRuntimeLock {

        private int acquireCount;
        private int releaseCount;

        @Override
        public Optional<WorkflowRuntimeLockLease> acquire(String workflowId) {
            acquireCount++;
            return Optional.of(new WorkflowRuntimeLockLease(workflowId, "token-1", Duration.ZERO));
        }

        @Override
        public boolean renew(WorkflowRuntimeLockLease lease) {
            return true;
        }

        @Override
        public boolean release(WorkflowRuntimeLockLease lease) {
            releaseCount++;
            return true;
        }
    }
}
