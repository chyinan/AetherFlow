package com.aetherflow.workflow.preflight;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WorkflowAiCapabilityPreflightServiceTest {

    @Test
    void rejectsUnavailableRemoteAiNodeBeforeRuntimeStarts() {
        AiWorkflowNodeClient client = mock(AiWorkflowNodeClient.class);
        when(client.capabilities()).thenReturn(Result.success(new AiWorkflowCapabilitiesDTO(
                true,
                false,
                false,
                List.of(),
                List.of(),
                List.of("LLM"),
                List.of(),
                Map.of("LLM", "llm runtime is disabled")
        )));
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);

        assertThatThrownBy(() -> service.validate(definition("LLM")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("llm runtime is disabled");
    }

    @Test
    void skipsRemoteCallForWorkflowWithoutRemoteAiNodes() {
        AiWorkflowNodeClient client = mock(AiWorkflowNodeClient.class);
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);

        service.validate(definition("START"));

        verify(client, never()).capabilities();
    }

    private static WorkflowDefinitionDTO definition(String nodeType) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId("node-1");
        node.setNodeType(nodeType);
        node.setConfig(Map.of());
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("preflight");
        definition.setNodes(List.of(node));
        return definition;
    }
}
