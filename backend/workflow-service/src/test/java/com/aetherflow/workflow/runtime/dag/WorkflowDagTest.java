package com.aetherflow.workflow.runtime.dag;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkflowDagTest {

    @Test
    void exposesPredecessorsForFanInJoin() {
        WorkflowDag dag = WorkflowDag.from(definition(
                node("start", "START", Map.of("nextNodes", List.of("left", "right"))),
                node("left", "LEFT", Map.of("next", "join")),
                node("right", "RIGHT", Map.of("next", "join")),
                node("join", "JOIN", Map.of())
        ));

        assertThat(dag.startNodeIds()).containsExactly("start");
        assertThat(dag.nextNodeIds("start", NodeResult.success(Map.of())))
                .containsExactly("left", "right");
        assertThat(dag.predecessorNodeIds("join")).containsExactlyInAnyOrder("left", "right");
        assertThat(dag.requiredPredecessorCount("join")).isEqualTo(2);
    }

    @Test
    void keepsSequentialFallbackForDefinitionsWithoutExplicitEdges() {
        WorkflowDag dag = WorkflowDag.from(definition(
                node("input", "INPUT", Map.of()),
                node("summary", "SUMMARY", Map.of())
        ));

        assertThat(dag.startNodeIds()).containsExactly("input");
        assertThat(dag.nextNodeIds("input", NodeResult.success(Map.of())))
                .containsExactly("summary");
        assertThat(dag.predecessorNodeIds("summary")).containsExactly("input");
        assertThat(dag.requiredPredecessorCount("summary")).isEqualTo(1);
    }

    @Test
    void rejectsRuntimeNextNodeThatWasNotDeclaredInDag() {
        WorkflowDag dag = WorkflowDag.from(definition(
                node("start", "START", Map.of("next", "declared")),
                node("declared", "DECLARED", Map.of()),
                node("hidden", "HIDDEN", Map.of())
        ));

        assertThatThrownBy(() -> dag.nextNodeIds(
                "start",
                NodeResult.success(Map.of()).withNextNodeId("hidden")
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not declared");
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("dag-test");
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
}
