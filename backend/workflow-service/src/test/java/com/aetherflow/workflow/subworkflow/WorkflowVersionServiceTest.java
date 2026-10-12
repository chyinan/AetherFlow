package com.aetherflow.workflow.subworkflow;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class WorkflowVersionServiceTest {
    private final WorkflowDefinitionVersionMapper mapper = mock(WorkflowDefinitionVersionMapper.class);
    private final ObjectMapper json = new ObjectMapper();
    private final WorkflowVersionService versions = new WorkflowVersionService(mapper, json);
    @AfterEach void clearUser() { AuthenticatedUserContext.clear(); }

    @Test
    void capturesExactSavedVersionWithoutUpdatingExistingSnapshots() {
        WorkflowDefinition definition = new WorkflowDefinition();
        definition.setId(7L); definition.setVersion(4); definition.setOwnerUserId(1L);
        definition.setDefinitionJson("{\"name\":\"frozen\"}");
        versions.capture(definition);
        ArgumentCaptor<WorkflowDefinitionVersion> capture = ArgumentCaptor.forClass(WorkflowDefinitionVersion.class);
        verify(mapper).insertImmutable(capture.capture());
        assertThat(capture.getValue().getVersion()).isEqualTo(4);
        assertThat(capture.getValue().getDefinitionJson()).isEqualTo(definition.getDefinitionJson());
    }

    @Test
    void resolvesFixedVersionAndChecksOrdinaryDagCycles() throws Exception {
        AuthenticatedUserContext.set(1L, "owner");
        WorkflowDefinitionDTO child = definition(node("old", "START", Map.of()));
        when(mapper.findOwned(7L, 2, 1L)).thenReturn(version(7L, 2, child));
        assertThat(versions.dependencies(definition(call("call", 7, 2)))).singleElement()
                .extracting(value -> value.getNodes().getFirst().getNodeId()).isEqualTo("old");
        verify(mapper).findOwned(7L, 2, 1L);
        WorkflowDefinitionDTO cyclic = definition(node("a", "START", Map.of("next", "b")),
                node("b", "START", Map.of("next", "a")));
        assertThatThrownBy(() -> versions.dependencies(cyclic)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cycle");
    }

    @Test
    void rejectsRecursiveVersionCallsIncludingNestedLoopBodies() throws Exception {
        AuthenticatedUserContext.set(1L, "owner");
        WorkflowDefinitionDTO child = definition(call("again", 7, 2));
        when(mapper.findOwned(7L, 2, 1L)).thenReturn(version(7L, 2, child));
        WorkflowNodeDTO loop = node("loop", "LOOP", Map.of("bodyNodes", List.of(
                Map.of("nodeId", "call", "nodeType", "SUBWORKFLOW", "config", call("unused", 7, 2).getConfig()))));
        assertThatThrownBy(() -> versions.dependencies(definition(loop)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("cycle");
    }

    private WorkflowDefinitionVersion version(long id, int version, WorkflowDefinitionDTO definition) throws Exception {
        WorkflowDefinitionVersion result = new WorkflowDefinitionVersion(); result.setDefinitionId(id); result.setVersion(version);
        result.setOwnerUserId(1L); result.setDefinitionJson(json.writeValueAsString(definition)); return result;
    }
    private WorkflowNodeDTO call(String id, long definitionId, int version) {
        return node(id, "SUBWORKFLOW", Map.of("definitionId", definitionId, "definitionVersion", version,
                "inputMappings", Map.of(), "outputMappings", Map.of()));
    }
    private WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO d = new WorkflowDefinitionDTO(); d.setName("test"); d.setNodes(List.of(nodes)); return d;
    }
    private WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO n = new WorkflowNodeDTO(); n.setNodeId(id); n.setNodeType(type); n.setConfig(config); return n;
    }
}
