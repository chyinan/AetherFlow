package com.aetherflow.workflow.subworkflow;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.entity.WorkflowStartOutbox;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowStartOutboxMapper;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.executor.SubworkflowNodeExecutor;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.*;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.*;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.aetherflow.workflow.service.impl.WorkflowServiceImpl;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** 真实运行引擎 + 模拟持久层，不调用第三方或模型。 */
class SubworkflowRuntimeTest {
    private final ObjectMapper json = new ObjectMapper();
    private final WorkflowVersionService versions = mock(WorkflowVersionService.class);
    private final WorkflowChildRunMapper calls = mock(WorkflowChildRunMapper.class);
    private final WorkflowInstanceMapper instances = mock(WorkflowInstanceMapper.class);
    private final WorkflowStartOutboxMapper outbox = mock(WorkflowStartOutboxMapper.class);
    private final InMemoryRuntimeSnapshotRepository snapshots = new InMemoryRuntimeSnapshotRepository();
    private final Map<Long, WorkflowInstance> rows = new HashMap<>();
    private final AtomicReference<WorkflowChildRun> call = new AtomicReference<>();
    private final AtomicInteger downstream = new AtomicInteger();
    private SubworkflowService service;
    private WorkflowRuntimeEngine engine;
    private NodeRegistry registry;
    private WorkflowDefinitionDTO childDefinition;
    private final Map<String, Object> config = Map.of("definitionId", 7, "definitionVersion", 2,
            "inputMappings", Map.of("text", "request.text"), "outputMappings", Map.of("answer", "result.text"));

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() throws Exception {
        AuthenticatedUserContext.set(1L, "owner");
        WorkflowInstance parent = new WorkflowInstance(); parent.setId(1L); parent.setUserId(1L); parent.setStatus("RUNNING"); rows.put(1L, parent);
        when(instances.selectById(any())).thenAnswer(invocation -> rows.get(((Number) invocation.getArgument(0)).longValue()));
        when(instances.insertIdempotent(any())).thenAnswer(invocation -> {
            WorkflowInstance child = invocation.getArgument(0); child.setId(2L); rows.put(2L, child); return 1;
        });
        when(calls.findInvocation(eq(1L), anyString())).thenAnswer(invocation -> call.get());
        doAnswer(invocation -> { WorkflowChildRun record = invocation.getArgument(0); record.setId(3L); call.set(record); return 1; }).when(calls).insert(any(WorkflowChildRun.class));
        when(calls.due(any(), anyInt())).thenAnswer(invocation -> call.get() == null || !"WAITING".equals(call.get().getStatus()) ? List.of() : List.of(call.get()));
        when(calls.recordAttempt(anyLong(), anyString(), any(), any())).thenAnswer(invocation -> {
            call.get().setStatus(invocation.getArgument(1)); return 1;
        });
        ObjectProvider<WorkflowServiceImpl> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(mock(WorkflowServiceImpl.class));
        service = new SubworkflowService(versions, calls, instances, outbox, json, snapshots, provider);
        childDefinition = definition(node("async", "ASYNC", Map.of()));
        WorkflowDefinitionVersion version = new WorkflowDefinitionVersion(); version.setDefinitionId(7L); version.setVersion(2);
        version.setDefinitionJson(json.writeValueAsString(childDefinition));
        when(versions.require(7L, 2)).thenReturn(version); when(versions.read(version)).thenReturn(childDefinition);
        registry = new NodeRegistry(List.of(new SubworkflowNodeExecutor(new WorkflowNodeMetrics(), service),
                executor("ASYNC", context -> { assertThat(context.variables()).containsEntry("text", "input");
                    return NodeResult.waiting(Map.of("externalTaskId", 44)); }),
                executor("AFTER", context -> { downstream.incrementAndGet();
                    assertThat(context.variables()).containsEntry("answer", "done").doesNotContainKey("childOnly");
                    return NodeResult.success(Map.of()); })));
        engine = newEngine();
    }
    @AfterEach void clearUser() { AuthenticatedUserContext.clear(); }

    @Test
    void childWaitsForAsyncResultAndFreshEngineResumesParentExactlyOnce() throws Exception {
        assertThat(startParent().runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(rows.get(2L).getDefinitionJson()).isEqualTo(json.writeValueAsString(childDefinition));
        assertThat(rows.get(2L).getInputJson()).isEqualTo("{\"text\":\"input\"}");
        assertThat(downstream).hasValue(0);
        verify(outbox).insert(any(WorkflowStartOutbox.class));
        // 模拟已提交 Outbox 的正常派发，然后收到异步完成结果。
        Map<String, Object> childInput = json.readValue(rows.get(2L).getInputJson(), new TypeReference<>() { });
        childInput.put("userId", 1L);
        assertThat(engine.execute(request("2", childDefinition, childInput)).runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(recovery(engine).reconcile()).isZero();
        engine = newEngine();
        engine.completeWaitingNode("2", "async", stored -> NodeResult.success(Map.of(),
                Map.of("result", Map.of("text", "done"), "childOnly", "not exported")), RetryPolicy.none());
        assertThat(recovery(engine).reconcile()).isEqualTo(1);
        assertThat(snapshots.findByWorkflowId("1").orElseThrow().runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(downstream).hasValue(1);
        assertThat(recovery(engine).reconcile()).isZero();
        verify(instances, times(1)).insertIdempotent(any());
    }

    @Test
    void invocationReplayReusesDurableChildReceipt() {
        startParent();
        DefaultWorkflowContext context = new DefaultWorkflowContext("1", "trace", "1", Map.of("request", Map.of("text", "changed")));
        context.updateCurrentNodeId("call");
        assertThat(service.invoke(context, config).waiting()).isTrue();
        verify(instances, times(1)).insertIdempotent(any());
        verify(outbox, times(1)).insert(any(WorkflowStartOutbox.class));
    }

    @Test
    void childFailureFailsParent() {
        startParent(); rows.get(2L).setStatus("FAILED");
        assertThat(recovery(engine).reconcile()).isEqualTo(1);
        assertThat(snapshots.findByWorkflowId("1").orElseThrow().runtimeState()).isEqualTo(RuntimeState.FAILED);
        assertThat(downstream).hasValue(0);
    }

    @Test
    void parentCancellationCancelsPendingChild() {
        startParent(); rows.get(1L).setStatus("CANCELLED");
        assertThat(recovery(engine).reconcile()).isEqualTo(1);
        verify(instances).cancelIfActive(eq(2L), eq(1L), any());
        assertThat(downstream).hasValue(0);
    }

    @Test
    void completedParentDoesNotCancelChildBeforeItsProjectionCatchesUp() {
        startParent(); rows.get(1L).setStatus("SUCCESS");
        assertThat(recovery(engine).reconcile()).isEqualTo(1);
        verify(instances, never()).cancelIfActive(anyLong(), anyLong(), any());
    }

    @Test
    void transientResultReadFailureKeepsReceiptForRetry() {
        startParent(); service = spy(service);
        doThrow(new IllegalStateException("temporary storage outage")).when(service).result(any());
        assertThat(recovery(engine).reconcile()).isZero();
        assertThat(call.get().getStatus()).isEqualTo("WAITING");
        assertThat(snapshots.findByWorkflowId("1").orElseThrow().runtimeState()).isEqualTo(RuntimeState.WAITING);
        assertThat(downstream).hasValue(0);
    }

    @Test
    void missingChildOutputFailsMappingWithoutAdvancingDownstream() {
        startParent();
        engine.execute(request("2", childDefinition, Map.of("text", "input", "userId", 1L)));
        engine.completeWaitingNode("2", "async", stored -> NodeResult.success(Map.of(), Map.of("other", "value")), RetryPolicy.none());
        assertThat(recovery(engine).reconcile()).isEqualTo(1);
        assertThat(snapshots.findByWorkflowId("1").orElseThrow().runtimeState()).isEqualTo(RuntimeState.FAILED);
        assertThat(downstream).hasValue(0);
    }

    @Test
    void derivedRunShowsOriginalChildReceiptWithoutCreatingExecutionRelationship() {
        startParent();
        WorkflowInstance derived = new WorkflowInstance(); derived.setId(9L); derived.setUserId(1L); derived.setStatus("PENDING");
        rows.put(9L, derived);
        WorkflowRuntimeSnapshot original = snapshots.findByWorkflowId("1").orElseThrow();
        NodeResult reused = NodeResult.success(original.nodeOutputs().get("call").output(), Map.of("answer", "done"));
        snapshots.save(new WorkflowRuntimeSnapshot("9", "new-trace", "9", original.definitionId(), original.definition(),
                RuntimeState.PENDING, List.of(), List.of("call"), List.of(), Map.of("userId", 1L), Map.of("call", reused), java.time.Instant.now()));
        when(calls.listOwned(9L, 1L)).thenReturn(List.of());
        when(calls.findChildOwned(2L, 1L)).thenReturn(call.get());
        assertThat(service.list(9L)).singleElement().satisfies(view -> {
            assertThat(view.reused()).isTrue();
            assertThat(view.sourceParentInstanceId()).isEqualTo(1L);
            assertThat(view.childInstanceId()).isEqualTo(2L);
        });
        verify(instances, times(1)).insertIdempotent(any());
        verify(calls, times(1)).insert(any(WorkflowChildRun.class));
    }

    @Test
    void replayOfCompletedChildStillPersistsReceiptBeforeReconciliation() {
        startParent(); rows.get(2L).setStatus("FAILED");
        DefaultWorkflowContext context = new DefaultWorkflowContext("1", "trace", "1", Map.of());
        context.updateCurrentNodeId("call");
        NodeResult waiting = service.invoke(context, config);
        assertThat(waiting.waiting()).isTrue();
        assertThat(waiting.output()).containsEntry("childWorkflowInstanceId", 2L);
        assertThat(recovery(engine).reconcile()).isEqualTo(1);
        assertThat(snapshots.findByWorkflowId("1").orElseThrow().runtimeState()).isEqualTo(RuntimeState.FAILED);
    }

    private WorkflowExecutionSnapshot startParent() {
        return engine.execute(request("1", definition(node("call", "SUBWORKFLOW", config), node("after", "AFTER", Map.of())),
                Map.of("request", Map.of("text", "input"), "userId", 1L)));
    }
    private WorkflowRuntimeEngine newEngine() {
        return new WorkflowRuntimeEngine(registry, new RuntimeStateMachine(), event -> {}, RuntimeSleeper.threadSleep(), snapshots);
    }
    private SubworkflowRecoveryJob recovery(WorkflowRuntimeEngine runtime) {
        return new SubworkflowRecoveryJob(calls, instances, snapshots, service, runtime, new WorkflowRuntimeProperties());
    }
    private WorkflowRuntimeRequest request(String id, WorkflowDefinitionDTO definition, Map<String, Object> input) {
        Map<String, Object> vars = new LinkedHashMap<>(input); Map<String, Object> configs = new LinkedHashMap<>();
        definition.getNodes().forEach(node -> configs.put(node.getNodeId(), node.getConfig())); vars.put(WorkflowNodeContextKeys.NODE_CONFIGS, configs);
        return new WorkflowRuntimeRequest(id, "trace", id, definition, vars, RetryPolicy.none());
    }
    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO d = new WorkflowDefinitionDTO(); d.setName("test"); d.setNodes(List.of(nodes)); return d;
    }
    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO n = new WorkflowNodeDTO(); n.setNodeId(id); n.setNodeType(type); n.setConfig(config); return n;
    }
    private NodeExecutor executor(String type, java.util.function.Function<WorkflowContext, NodeResult> action) {
        return new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of(type); }
            public NodeResult execute(WorkflowContext context) { return action.apply(context); }
        };
    }
}
