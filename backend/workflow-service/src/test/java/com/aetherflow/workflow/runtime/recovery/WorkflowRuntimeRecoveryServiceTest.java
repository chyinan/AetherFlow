package com.aetherflow.workflow.runtime.recovery;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RetryPolicy;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowRuntimeRecoveryServiceTest {

    @Test
    void recoversRunningAndRetryingSnapshotsOnly() {
        AtomicInteger resumedNodes = new AtomicInteger();
        WorkflowDefinitionDTO definition = definition(
                node("node-input", "INPUT", Map.of("next", "node-summary")),
                node("node-summary", "SUMMARY", Map.of())
        );
        NodeRegistry registry = new NodeRegistry(List.of(
                executor("INPUT", context -> NodeResult.success(Map.of("text", "already-done"))),
                executor("SUMMARY", context -> {
                    resumedNodes.incrementAndGet();
                    return NodeResult.success(Map.of("summary", "done"));
                })
        ));
        InMemoryRuntimeSnapshotRepository repository = new InMemoryRuntimeSnapshotRepository();
        repository.save(snapshot("workflow-running", RuntimeState.RUNNING, definition));
        repository.save(snapshot("workflow-retrying", RuntimeState.RETRYING, definition));
        repository.save(snapshot("workflow-success", RuntimeState.SUCCESS, definition));
        WorkflowRuntimeRecoveryService recoveryService = new WorkflowRuntimeRecoveryService(
                repository,
                new WorkflowRuntimeEngine(registry),
                new WorkflowRuntimeProperties()
        );

        List<WorkflowExecutionSnapshot> recovered = recoveryService.recoverRunnableWorkflows();

        assertThat(recovered).hasSize(2);
        assertThat(recovered).extracting(WorkflowExecutionSnapshot::workflowId)
                .containsExactlyInAnyOrder("workflow-running", "workflow-retrying");
        assertThat(resumedNodes).hasValue(2);
        assertThat(repository.findByWorkflowId("workflow-running").orElseThrow().runtimeState())
                .isEqualTo(RuntimeState.SUCCESS);
        assertThat(repository.findByWorkflowId("workflow-success").orElseThrow().runtimeState())
                .isEqualTo(RuntimeState.SUCCESS);
    }

    private static WorkflowRuntimeSnapshot snapshot(String workflowId,
                                                    RuntimeState state,
                                                    WorkflowDefinitionDTO definition) {
        return new WorkflowRuntimeSnapshot(
                workflowId,
                "trace-" + workflowId,
                "task-" + workflowId,
                null,
                definition,
                state,
                List.of("node-summary"),
                List.of("node-input"),
                List.of(),
                Map.of("text", "transcribed"),
                Map.of("node-input", NodeResult.success(Map.of("text", "transcribed"))),
                Instant.parse("2026-05-28T10:00:00Z")
        );
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
        definition.setName("runtime-recovery-service-test");
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
