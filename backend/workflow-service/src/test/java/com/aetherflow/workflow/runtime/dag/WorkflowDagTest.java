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
                node("declared", "DECLARED", Map.of("next", "hidden")),
                node("hidden", "HIDDEN", Map.of())
        ));

        assertThatThrownBy(() -> dag.nextNodeIds(
                "start",
                NodeResult.success(Map.of()).withNextNodeId("hidden")
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not declared");
    }

    @Test
    void rejectsSelfLoop() {
        assertThatThrownBy(() -> WorkflowDag.from(definition(
                node("start", "START", Map.of("next", "start"))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cycle");
    }

    @Test
    void rejectsTwoNodeCycle() {
        assertThatThrownBy(() -> WorkflowDag.from(definition(
                node("a", "START", Map.of("next", "b")),
                node("b", "SUMMARY", Map.of("next", "a"))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cycle");
    }

    @Test
    void rejectsMultiNodeCycle() {
        assertThatThrownBy(() -> WorkflowDag.from(definition(
                node("a", "START", Map.of("next", "b")),
                node("b", "SUMMARY", Map.of("next", "c")),
                node("c", "EXPORT", Map.of("next", "a"))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cycle");
    }

    @Test
    void acceptsDagWithMultipleZeroIndegreeStartNodes() {
        // The DAG below has TWO zero-indegree nodes ("start" and "orphan"). Per the
        // startNodeIds() definition, BOTH are start nodes, so the graph is well-formed:
        // every node is reachable from at least one start. The pre-fix validateReachable
        // implementation seeded its BFS queue with only startNodeIds.get(0) (== "start"),
        // which made "orphan" appear unreachable and wrongly rejected this DAG. The fix
        // seeds the queue with the whole start list, so this definition now builds cleanly.
        WorkflowDag dag = WorkflowDag.from(definition(
                node("start", "START", Map.of("next", "summary")),
                node("summary", "SUMMARY", Map.of()),
                node("orphan", "EXPORT", Map.of())
        ));

        assertThat(dag.startNodeIds()).containsExactlyInAnyOrder("start", "orphan");
        assertThat(dag.nodeIds()).containsExactly("start", "summary", "orphan");
    }

    @Test
    void acceptsMultiSourceDagReachableFromEveryStartNode() {
        // Two independent zero-indegree start nodes, each with its own downstream subgraph.
        // Prior to the reachability fix the BFS only seeded startNodeIds.get(0); nodes behind
        // the second start ("b", "b2") were falsely classified as unreachable and the
        // workflow definition was rejected even though every node genuinely has a start
        // ancestor.
        WorkflowDag dag = WorkflowDag.from(definition(
                node("a", "START", Map.of("next", "a2")),
                node("a2", "SUMMARY", Map.of()),
                node("b", "START", Map.of("next", "b2")),
                node("b2", "EXPORT", Map.of())
        ));

        assertThat(dag.startNodeIds()).containsExactlyInAnyOrder("a", "b");
        assertThat(dag.nodeIds()).containsExactly("a", "a2", "b", "b2");
        assertThat(dag.nextNodeIds("a", NodeResult.success(Map.of()))).containsExactly("a2");
        assertThat(dag.nextNodeIds("b", NodeResult.success(Map.of()))).containsExactly("b2");
    }

    @Test
    void rejectsUnknownEdgeTarget() {
        assertThatThrownBy(() -> WorkflowDag.from(definition(
                node("start", "START", Map.of("next", "missing"))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("target not found");
    }

    @Test
    void acceptsLegalBranchGraph() {
        WorkflowDag dag = WorkflowDag.from(definition(
                node("start", "START", Map.of("nextNodes", List.of("left", "right"))),
                node("left", "SUMMARY", Map.of("next", "join")),
                node("right", "EXPORT", Map.of("next", "join")),
                node("join", "END", Map.of())
        ));

        assertThat(dag.startNodeIds()).containsExactly("start");
        assertThat(dag.nodeIds()).containsExactly("start", "left", "right", "join");
        assertThat(dag.requiredPredecessorCount("join")).isEqualTo(2);
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
