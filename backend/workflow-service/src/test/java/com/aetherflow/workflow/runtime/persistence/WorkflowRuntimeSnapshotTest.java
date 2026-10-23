package com.aetherflow.workflow.runtime.persistence;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowRuntimeSnapshotTest {

    @Test
    void preservesExplicitNullVariableAcrossExecutionAndPersistenceSnapshots() {
        Map<String, Object> variables = new HashMap<>();
        variables.put("result", null);
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("Null value");
        definition.setNodes(List.of());

        WorkflowExecutionSnapshot execution = new WorkflowExecutionSnapshot(
                "1", "trace", "task", RuntimeState.RUNNING, null, List.of(), variables,
                Map.of(), List.of(), List.of());
        WorkflowRuntimeSnapshot persisted = new WorkflowRuntimeSnapshot(
                "1", "trace", "task", 1L, definition, RuntimeState.RUNNING,
                List.of(), List.of(), List.of(), execution.variables(), execution.nodeOutputs(), Instant.now());

        assertThat(persisted.variables()).containsKey("result").containsEntry("result", null);
        assertThat(persisted.toExecutionSnapshot().variables()).containsKey("result").containsEntry("result", null);
    }
}
