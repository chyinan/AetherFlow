package com.aetherflow.workflow.preflight;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.NodeConnectionValidationResponse;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

class WorkflowNodeConnectionPreflightTest {
    private final AiWorkflowNodeClient client = mock(AiWorkflowNodeClient.class);
    private final WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);

    @Test
    void explicitConnectionUsesItsOwnProbeAndTransmitsSelectedModelOptions() {
        when(client.capabilities()).thenReturn(Result.success(snapshot()));
        when(client.validateConnections(any())).thenReturn(Result.success(new NodeConnectionValidationResponse(List.of())));
        WorkflowDefinitionDTO definition = definition(node("image", Map.of(
                "connectionId", "saved-one", "provider", "COMFYUI", "checkpoint", "photo.safetensors",
                "vae", "photo.vae", "sampler", "euler", "scheduler", "normal",
                "lora", List.of(Map.of("name", "photo-lora", "weight", 0.5)))));

        service.validate(definition, 7L);

        verify(client).validateConnections(argThat(request -> request.userId().equals(7L)
                && request.nodes().size() == 1 && request.nodes().get(0).connectionId().equals("saved-one")
                && request.nodes().get(0).checkpoint().equals("photo.safetensors")
                && request.nodes().get(0).vae().equals("photo.vae")
                && request.nodes().get(0).loras().equals(List.of("photo-lora"))));
    }

    @Test
    void missingConnectionFailureIsNeverReplacedWithDeploymentFallback() {
        when(client.capabilities()).thenReturn(Result.success(snapshot()));
        when(client.validateConnections(any())).thenReturn(Result.success(new NodeConnectionValidationResponse(
                List.of("node image: connection was not found"))));

        assertThatThrownBy(() -> service.validate(definition(node("image", Map.of("connectionId", "deleted"))), 7L))
                .isInstanceOf(BusinessException.class).hasMessageContaining("connection was not found");
    }

    @Test
    void failedOrEmptyConnectionResponseStopsPreflight() {
        when(client.capabilities()).thenReturn(Result.success(snapshot()));
        when(client.validateConnections(any())).thenReturn(null);

        assertThatThrownBy(() -> service.validate(definition(node("image", Map.of("connectionId", "saved-one"))), 7L))
                .isInstanceOf(BusinessException.class).hasMessageContaining("no usable result");
    }

    @Test
    void validatedConnectionDoesNotMakeLegacyNodeExecutable() {
        when(client.capabilities()).thenReturn(Result.success(snapshot()));
        when(client.validateConnections(any())).thenReturn(Result.success(new NodeConnectionValidationResponse(List.of())));

        assertThatThrownBy(() -> service.validate(definition(node("configured", Map.of("connectionId", "saved-one")),
                        node("legacy", Map.of())), 7L))
                .isInstanceOf(BusinessException.class).hasMessageContaining("node legacy");
    }

    @Test
    void connectionIdAloneDoesNotBypassExistingCapabilityPolicy() {
        assertThat(WorkflowAiCapabilityPolicy.validate(
                definition(node("image", Map.of("connectionId", "saved-one"))), snapshot()))
                .anyMatch(message -> message.contains("deployment images disabled"));
    }

    @Test
    void deploymentOnlyWorkflowDoesNotCallNewProbe() {
        when(client.capabilities()).thenReturn(Result.success(snapshot()));
        assertThatThrownBy(() -> service.validate(definition(node("legacy", Map.of())), 7L))
                .hasMessageContaining("deployment images disabled");
        verify(client, never()).validateConnections(any());
    }

    private static AiWorkflowCapabilitiesDTO snapshot() {
        return new AiWorkflowCapabilitiesDTO(true, false, false, List.of(), List.of(),
                List.of("IMAGE_GENERATION", "UPSCALE"), List.of(),
                Map.of("IMAGE_GENERATION", "deployment images disabled"));
    }

    private static WorkflowNodeDTO node(String id, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType("IMAGE_GENERATION");
        node.setConfig(config);
        return node;
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("connections");
        definition.setNodes(List.of(nodes));
        return definition;
    }
}
