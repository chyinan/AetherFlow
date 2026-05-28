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
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowRuntimeRecoveryTest {

    @Test
    void resumesFromSnapshotAndSkipsCompletedNodes() {
        AtomicInteger startRuns = new AtomicInteger();
        AtomicInteger summaryRuns = new AtomicInteger();
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("INPUT", context -> {
                    startRuns.incrementAndGet();
                    return NodeResult.success(Map.of("text", "should-not-run"));
                }),
                executor("SUMMARY", context -> {
                    summaryRuns.incrementAndGet();
                    assertThat(context.variables()).containsEntry("text", "transcribed");
                    assertThat(context.nodeOutputs()).containsKey("node-input");
                    return NodeResult.success(Map.of("summary", "done"), Map.of("summaryText", "done"));
                }),
                executor("EXPORT", context -> {
                    assertThat(context.variables()).containsEntry("summaryText", "done");
                    assertThat(context.nodeOutputs()).containsKeys("node-input", "node-summary");
                    return NodeResult.success(Map.of("exported", true));
                })
        ));
        WorkflowRuntimeEngine engine = new WorkflowRuntimeEngine(registry);
        WorkflowDefinitionDTO definition = definition(
                node("node-input", "INPUT", Map.of("next", "node-summary")),
                node("node-summary", "SUMMARY", Map.of("next", "node-export")),
                node("node-export", "EXPORT", Map.of())
        );
        WorkflowExecutionSnapshot recoveryPoint = new WorkflowExecutionSnapshot(
                "workflow-recover",
                "trace-recover",
                "task-recover",
                RuntimeState.RUNNING,
                "node-summary",
                List.of("node-summary"),
                Map.of("text", "transcribed"),
                Map.of("node-input", NodeResult.success(Map.of("text", "transcribed"))),
                List.of("node-input"),
                List.of()
        );

        WorkflowExecutionSnapshot snapshot = engine.resume(new WorkflowRuntimeRequest(
                "workflow-recover",
                "trace-recover",
                "task-recover",
                definition,
                Map.of(),
                RetryPolicy.none()
        ), recoveryPoint);

        assertThat(startRuns).hasValue(0);
        assertThat(summaryRuns).hasValue(1);
        assertThat(snapshot.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        assertThat(snapshot.completedNodeIds()).containsExactly("node-input", "node-summary", "node-export");
        assertThat(snapshot.variables()).containsEntry("text", "transcribed").containsEntry("summaryText", "done");
        assertThat(snapshot.nodeOutputs()).containsKeys("node-input", "node-summary", "node-export");
    }

    private static NodeExecutor executor(String type, NodeBehavior behavior) {
        return new NodeExecutor() {
            @Override
            public NodeType nodeType() {
                return NodeType.of(type);
            }

            @Override
            public NodeResult execute(WorkflowContext context) throws Exception {
                return behavior.execute(context);
            }
        };
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("runtime-recovery-test");
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
}
