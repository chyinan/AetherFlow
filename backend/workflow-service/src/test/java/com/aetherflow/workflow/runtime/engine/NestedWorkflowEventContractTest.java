package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.*;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.persistence.*;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/** 独立功能审查用例：只使用内存节点与快照，不调用任何外部服务。 */
class NestedWorkflowEventContractTest {
    @Test void 循环体人工等待事件保留审批详情() {
        List<RuntimeEvent> events = new CopyOnWriteArrayList<>();
        MemorySnapshots snapshots = new MemorySnapshots();
        WorkflowRuntimeEngine engine = engine(events, snapshots);
        var result = engine.execute(request());
        assertThat(result.runtimeState()).isEqualTo(RuntimeState.WAITING);
        RuntimeEvent waiting = events.stream().filter(event -> event.eventType() == RuntimeEventType.NODE_WAITING
                && "batch/iteration-0/approval".equals(event.nodeId())).findFirst().orElseThrow();
        assertThat(waiting.attributes()).containsEntry("approvalStatus", "pending").containsEntry("reviewer", "reviewer-a");
    }

    @Test void 循环体完成事件只发布一次且恢复后不保留等待显示() {
        List<RuntimeEvent> events = new CopyOnWriteArrayList<>();
        MemorySnapshots snapshots = new MemorySnapshots();
        WorkflowRuntimeEngine engine = engine(events, snapshots);
        WorkflowRuntimeRequest request = request();
        var first = engine.execute(request);
        engine = engine(events, snapshots);
        var second = engine.completeWaitingNode(request, first, "batch/iteration-0/approval", NodeResult.success(Map.of("approved", true)));
        engine.completeWaitingNode(request, second, "batch/iteration-0/approval", NodeResult.success(Map.of("approved", true)));
        assertThat(events.stream().filter(event -> event.eventType() == RuntimeEventType.NODE_COMPLETED
                && "batch/iteration-0/approval".equals(event.nodeId())).count()).isEqualTo(1);
    }

    private static WorkflowRuntimeEngine engine(List<RuntimeEvent> events, MemorySnapshots snapshots) {
        NodeExecutor approval = new NodeExecutor() {
            public NodeType nodeType() { return NodeType.of("HUMAN"); }
            public NodeResult execute(WorkflowContext context) {
                return NodeResult.waiting(Map.of("approvalStatus", "pending", "reviewer", "reviewer-a", "approved", false));
            }
        };
        return new WorkflowRuntimeEngine(new NodeRegistry(List.of(approval)), new RuntimeStateMachine(), events::add,
                RuntimeSleeper.noop(), snapshots);
    }

    private static WorkflowRuntimeRequest request() {
        WorkflowNodeDTO batch = new WorkflowNodeDTO(); batch.setNodeId("batch"); batch.setNodeType("ITERATION");
        batch.setConfig(Map.of("inputVariable", "items", "concurrency", 2,
                "bodyNodes", List.of(Map.of("nodeId", "approval", "nodeType", "HUMAN", "config", Map.of()))));
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO(); definition.setNodes(List.of(batch)); definition.setName("事件闭环");
        return new WorkflowRuntimeRequest("1001", "trace", "task", definition, Map.of("items", List.of("a", "b")), RetryPolicy.none());
    }

    private static class MemorySnapshots implements RuntimeSnapshotRepository {
        private WorkflowRuntimeSnapshot snapshot;
        public void save(WorkflowRuntimeSnapshot value) { snapshot = value; }
        public Optional<WorkflowRuntimeSnapshot> findByWorkflowId(String id) { return Optional.ofNullable(snapshot); }
        public List<WorkflowRuntimeSnapshot> findRecoverable(int limit) { return snapshot == null ? List.of() : List.of(snapshot); }
    }
}
