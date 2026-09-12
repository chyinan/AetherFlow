package com.aetherflow.workflow.service.impl;

// pattern: Imperative Shell
// 独立审查复现：复用现有测试夹具，模拟数据库插入后可立即查到新记录。
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.entity.WorkflowStartOutbox;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowStartOutboxMapper;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mockito.MockitoAnnotations;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicReference;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import java.time.Instant;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.runtime.stream.RuntimeEventStreamService;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.RuntimeSleeper;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import java.util.Optional;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class AuditRuntimeRepro {
    public static void main(String[] args) throws Exception {
        reproduce(false);
        reproduce(true);
        reproduceStreamPageBoundary();
        reproduceStaleRecovery();
    }

    private static void reproduceStaleRecovery() {
        WorkflowNodeDTO done = new WorkflowNodeDTO();
        done.setNodeId("done"); done.setNodeType("AUDIT"); done.setConfig(Map.of("nextNodes", List.of("waiting")));
        WorkflowNodeDTO waiting = new WorkflowNodeDTO();
        waiting.setNodeId("waiting"); waiting.setNodeType("AUDIT"); waiting.setConfig(Map.of());
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("审查恢复竞态"); definition.setNodes(List.of(done, waiting));
        Map<String, Object> variables = Map.of("userId", 7L);
        WorkflowExecutionSnapshot stale = new WorkflowExecutionSnapshot("992", "trace", "task", RuntimeState.RUNNING,
                "done", variables, Map.of(), List.of());
        WorkflowRuntimeSnapshot latest = new WorkflowRuntimeSnapshot("992", "trace", "task", 10L, definition,
                RuntimeState.WAITING, List.of("waiting"), List.of("done"), List.of(), variables,
                Map.of("done", NodeResult.success(Map.of()), "waiting", NodeResult.waiting(Map.of("externalTaskId", 55L))), Instant.now());
        RuntimeSnapshotRepository snapshots = mock(RuntimeSnapshotRepository.class);
        when(snapshots.findByWorkflowId("992")).thenReturn(Optional.of(latest));
        AtomicInteger reruns = new AtomicInteger();
        NodeExecutor executor = new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of("AUDIT"); }
            public NodeResult execute(WorkflowContext context) {
                if ("done".equals(context.currentNodeId())) { reruns.incrementAndGet(); return NodeResult.success(Map.of()); }
                return NodeResult.waiting(Map.of("externalTaskId", 55L));
            }
        };
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of(executor)),
                new RuntimeStateMachine(), event -> {}, RuntimeSleeper.threadSleep(), snapshots);
        RetryPolicy retry = RetryPolicy.of(1, Duration.ZERO, 1, Duration.ZERO);
        engine.resume(new WorkflowRuntimeRequest("992", "trace", "task", 10L, definition, variables, retry), stale);
        if (reruns.get() != 1) throw new AssertionError("旧快照恢复重复执行未复现");
        verify(snapshots, never()).findByWorkflowId("992");
        System.out.println("REPRODUCED: latest durable snapshot=WAITING with done completed; resume(stale RUNNING) re-executes done, fresh snapshot reads=0");
    }

    private static void reproduceStreamPageBoundary() {
        RuntimeEventStore store = mock(RuntimeEventStore.class);
        List<RuntimeEvent> all = IntStream.rangeClosed(1, 501).mapToObj(number -> new RuntimeEvent(
                "event-" + number, number == 501 ? RuntimeEventType.WORKFLOW_COMPLETED : RuntimeEventType.NODE_COMPLETED,
                "stream-repro", "trace", "task", "node-" + number,
                number == 501 ? RuntimeState.SUCCESS : RuntimeState.RUNNING,
                Instant.EPOCH.plusSeconds(number), Map.<String, Object>of())).toList();
        when(store.supportsIncrementalQuery()).thenReturn(true);
        when(store.findByWorkflowId("stream-repro", 500)).thenReturn(all.subList(0, 500));
        when(store.findByWorkflowIdAfter("stream-repro", "event-500", 500)).thenReturn(all.subList(500, 501));
        RuntimeEventStreamService service = new RuntimeEventStreamService(store);
        try {
            List<RuntimeEvent> first = service.eventsAfterCursor("stream-repro", null);
            List<RuntimeEvent> next = service.eventsAfterCursor("stream-repro", "event-500");
            if (first.size() != 500 || !next.isEmpty()) throw new AssertionError("分页卡顿未复现");
            verify(store, never()).findByWorkflowIdAfter("stream-repro", "event-500", 500);
            System.out.println("REPRODUCED: 501 persisted events -> first page=500, after event-500=0, incremental query calls=0, terminal event hidden");
        } finally {
            service.shutdown();
        }
    }

    private static void reproduce(boolean keyed) throws Exception {
        WorkflowServiceImplTest fixture = new WorkflowServiceImplTest();
        try (AutoCloseable mocks = MockitoAnnotations.openMocks(fixture)) {
            fixture.setUp();
            WorkflowDefinitionMapper definitions = field(fixture, "definitionMapper", WorkflowDefinitionMapper.class);
            WorkflowInstanceMapper instances = field(fixture, "instanceMapper", WorkflowInstanceMapper.class);
            WorkflowStartOutboxMapper outbox = field(fixture, "workflowStartOutboxMapper", WorkflowStartOutboxMapper.class);
            WorkflowRuntimeEngine engine = field(fixture, "runtimeEngine", WorkflowRuntimeEngine.class);
            ObjectMapper json = field(fixture, "objectMapper", ObjectMapper.class);
            WorkflowServiceImpl service = field(fixture, "workflowService", WorkflowServiceImpl.class);
            WorkflowDefinition definition = helper("definitionEntity", WorkflowDefinition.class);
            WorkflowDefinitionDTO dag = helper("definitionDTO", WorkflowDefinitionDTO.class);
            StartWorkflowRequest request = helper("request", StartWorkflowRequest.class);
            if (keyed) request.setIdempotencyKey("audit-new-key-20260912");
            AtomicReference<WorkflowInstance> stored = new AtomicReference<>();
            when(definitions.selectById(10L)).thenReturn(definition);
            when(json.readValue("{}", WorkflowDefinitionDTO.class)).thenReturn(dag);
            when(json.writeValueAsString(request.getInput())).thenReturn("{}");
            doAnswer(call -> {
                WorkflowInstance row = call.getArgument(0);
                row.setId(991L);
                stored.set(row);
                return 1;
            }).when(instances).insert(any(WorkflowInstance.class));
            doAnswer(call -> {
                WorkflowInstance row = call.getArgument(0);
                row.setId(991L);
                stored.set(row);
                return 1;
            }).when(instances).insertIdempotent(any(WorkflowInstance.class));
            when(instances.selectById(991L)).thenAnswer(call -> stored.get());
            WorkflowInstance result = AuthenticatedUserContext.runAs(7L, "aether.operator",
                    () -> service.startInstance(10L, request));
            if (result.getId() != 991L || !"PENDING".equals(result.getStatus())) {
                throw new AssertionError("实例插入复现夹具未正常生效");
            }
            if (keyed) {
                verify(instances).insertIdempotent(any(WorkflowInstance.class));
                verify(outbox, never()).insert(any(WorkflowStartOutbox.class));
                verifyNoInteractions(engine);
                System.out.println("REPRODUCED: new idempotencyKey -> row inserted, status=PENDING, outbox inserts=0, runtime calls=0");
            } else {
                verify(outbox).insert(any(WorkflowStartOutbox.class));
                System.out.println("CONTROL: absent idempotencyKey -> row inserted, status=PENDING, outbox inserts=1");
            }
            service.shutdownStartLeaseHeartbeat();
        }
    }

    private static <T> T field(Object target, String name, Class<T> type) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return type.cast(field.get(target));
    }

    private static <T> T helper(String name, Class<T> type) throws Exception {
        Method method = WorkflowServiceImplTest.class.getDeclaredMethod(name);
        method.setAccessible(true);
        return type.cast(method.invoke(null));
    }
}
