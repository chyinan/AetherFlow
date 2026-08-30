package com.aetherflow.workflow.runtime.async;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.NodeWaitingException;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.RuntimeSleeper;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLockLease;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

// pattern: Imperative Shell
class WorkflowAsyncCompletionConcurrencyTest {

    @Test
    void fastCallbackWaitsForInitialRuntimeLockBeforeReadingWaitingSnapshot() throws Exception {
        CountDownLatch nodeStarted = new CountDownLatch(1);
        CountDownLatch releaseNode = new CountDownLatch(1);
        BlockingWorkflowRuntimeLock lock = new BlockingWorkflowRuntimeLock();
        InMemoryRuntimeSnapshotRepository snapshots = new InMemoryRuntimeSnapshotRepository();
        NodeRegistry registry = new NodeRegistry(List.of(waitingExecutor(nodeStarted, releaseNode)));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(
                registry,
                new RuntimeStateMachine(),
                event -> {
                },
                RuntimeSleeper.noop(),
                snapshots,
                lock);
        WorkflowRuntimeRequest request = new WorkflowRuntimeRequest(
                "101", "trace-101", "101", 10L, definition(),
                Map.of("userId", 7L, "username", "operator"), RetryPolicy.none());
        CompletableFuture<WorkflowExecutionSnapshot> initial = CompletableFuture.supplyAsync(() ->
                AuthenticatedUserContext.runAs(7L, "operator", () -> engine.execute(request)));
        assertThat(nodeStarted.await(2, TimeUnit.SECONDS)).isTrue();
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                snapshots,
                engine,
                new WorkflowRuntimeProperties(),
                mock(WorkflowInstanceMapper.class));

        CompletableFuture<WorkflowExecutionSnapshot> callback = CompletableFuture.supplyAsync(() ->
                service.completeSuccess(101L, "node-whisper", Map.of("text", "hello")));
        assertThat(lock.secondAcquireStarted.await(2, TimeUnit.SECONDS)).isTrue();
        releaseNode.countDown();

        assertThat(initial.get(2, TimeUnit.SECONDS).runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(callback.get(2, TimeUnit.SECONDS).runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshots.findByWorkflowId("101").orElseThrow().runtimeState()).isEqualTo(RuntimeState.SUCCESS);
    }

    private static NodeExecutor waitingExecutor(CountDownLatch nodeStarted, CountDownLatch releaseNode) {
        return new NodeExecutor() {
            @Override
            public NodeType nodeType() {
                return NodeType.of("WHISPER");
            }

            @Override
            public NodeResult execute(WorkflowContext context) throws Exception {
                nodeStarted.countDown();
                if (!releaseNode.await(2, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("timed out waiting to release async node");
                }
                throw new NodeWaitingException(Map.of("externalTaskId", 91L));
            }
        };
    }

    private static WorkflowDefinitionDTO definition() {
        WorkflowNodeDTO whisper = new WorkflowNodeDTO();
        whisper.setNodeId("node-whisper");
        whisper.setNodeType("WHISPER");
        whisper.setConfig(Map.of());
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("fast-callback-test");
        definition.setNodes(List.of(whisper));
        return definition;
    }

    private static final class BlockingWorkflowRuntimeLock implements WorkflowRuntimeLock {

        private final ReentrantLock delegate = new ReentrantLock();
        private final AtomicInteger acquireCount = new AtomicInteger();
        private final CountDownLatch secondAcquireStarted = new CountDownLatch(1);

        @Override
        public Optional<WorkflowRuntimeLockLease> acquire(String workflowId) {
            int currentAcquire = acquireCount.incrementAndGet();
            if (currentAcquire == 2) {
                secondAcquireStarted.countDown();
            }
            delegate.lock();
            return Optional.of(new WorkflowRuntimeLockLease(
                    workflowId, "token-" + currentAcquire, Duration.ZERO));
        }

        @Override
        public boolean renew(WorkflowRuntimeLockLease lease) {
            return true;
        }

        @Override
        public boolean release(WorkflowRuntimeLockLease lease) {
            delegate.unlock();
            return true;
        }
    }
}
