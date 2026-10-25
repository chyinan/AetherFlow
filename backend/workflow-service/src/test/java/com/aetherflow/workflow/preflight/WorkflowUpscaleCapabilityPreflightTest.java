package com.aetherflow.workflow.preflight;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.NodeConnectionValidationRequest;
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

class WorkflowUpscaleCapabilityPreflightTest {

    private static final Map<String, Object> PLUGIN_GRAPH = Map.of(
            "1", Map.of("class_type", "LoadImage", "inputs", Map.of("image", "placeholder.png")),
            "2", Map.of("class_type", "AcmeSuperResolution", "inputs", Map.of("image", List.of("1", 0))),
            "3", Map.of("class_type", "SaveImage", "inputs", Map.of("images", List.of("2", 0))));
    private static final Map<String, Object> SOURCE_BINDING = Map.of(
            "nodeId", "1", "inputName", "image", "parameter", "sourceImage");

    @Test
    void explicitComfyUpscaleConnectionRejectsMissingSourceBindingBeforeRemoteChecks() {
        StubClient client = readyClient();
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);
        WorkflowDefinitionDTO definition = definition(upscale(Map.of(
                "provider", "COMFYUI", "connectionId", "working-connection", "workflowJson", PLUGIN_GRAPH)));

        assertThatThrownBy(() -> service.validate(definition, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("upscale-1")
                .hasMessageContaining("sourceImage");

        assertThat(client.capabilityCalls).isZero();
        assertThat(client.connectionCalls).isZero();
    }

    @Test
    void validPluginUpscaleGraphAcceptsTopLevelAndLegacyOptionsBindings() {
        assertValidPluginUpscale(Map.of("workflowBindings", List.of(SOURCE_BINDING)));
        assertValidPluginUpscale(Map.of("options", Map.of("workflowBindings", List.of(SOURCE_BINDING))));
        java.util.LinkedHashMap<String, Object> nullTopLevelBinding = new java.util.LinkedHashMap<>();
        nullTopLevelBinding.put("workflowBindings", null);
        nullTopLevelBinding.put("options", Map.of("workflowBindings", List.of(SOURCE_BINDING)));
        assertValidPluginUpscale(nullTopLevelBinding);
    }

    @Test
    void defaultAndUiUpscaleGraphsKeepTheirExistingFallbackBehavior() {
        AiWorkflowNodeClient client = readyClient();
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);
        var uiGraph = Map.of("nodes", List.of(Map.of("id", 1, "type", "LoadImage")), "links", List.of());

        service.validate(definition(upscale(Map.of("provider", "COMFYUI", "connectionId", "working-connection"))), 7L);
        service.validate(definition(upscale(Map.of("provider", "COMFYUI", "connectionId", "working-connection", "workflow", uiGraph))), 7L);
    }

    @Test
    void sourceImageRemainsOptionalForImageGenerationApiGraphs() {
        AiWorkflowNodeClient client = readyClient();
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);
        WorkflowNodeDTO imageGeneration = node("image-1", "IMAGE_GENERATION", Map.of(
                "provider", "COMFYUI", "connectionId", "working-connection", "workflowJson", PLUGIN_GRAPH));

        service.validate(definition(imageGeneration), 7L);
    }

    @Test
    void malformedAndMissingTargetBindingsAreRejectedAtTheUpscaleNode() {
        for (Object bindings : List.of(
                "not-a-list",
                List.of(Map.of("nodeId", "missing", "inputName", "image", "parameter", "sourceImage")),
                List.of(Map.of("nodeId", "1", "inputName", "missing", "parameter", "sourceImage")),
                List.of(Map.of("nodeId", "1", "inputName", "image", "parameter", "unknown")))) {
            AiWorkflowNodeClient client = readyClient();
            WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);
            WorkflowDefinitionDTO definition = definition(upscale(Map.of(
                    "provider", "COMFYUI", "connectionId", "working-connection", "workflowJson", PLUGIN_GRAPH,
                    "workflowBindings", bindings)));

            assertThatThrownBy(() -> service.validate(definition, 7L))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("upscale-1")
                    .hasMessageContaining("workflowBindings");
        }

        StubClient client = readyClient();
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);
        WorkflowDefinitionDTO definition = definition(upscale(Map.of(
                "provider", "COMFYUI", "connectionId", "working-connection", "workflowJson", PLUGIN_GRAPH,
                "options", Map.of("workflowBindings", "not-a-list"))));

        assertThatThrownBy(() -> service.validate(definition, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("upscale-1")
                .hasMessageContaining("workflowBindings");
    }

    @Test
    void malformedExecutionGraphIsRejectedAtTheUpscaleNode() {
        StubClient client = readyClient();
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);
        WorkflowDefinitionDTO definition = definition(upscale(Map.of(
                "provider", "COMFYUI", "connectionId", "working-connection", "workflowJson", "   ")));

        assertThatThrownBy(() -> service.validate(definition, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("upscale-1")
                .hasMessageContaining("workflow:VALIDATION");

        assertThat(client.capabilityCalls).isZero();
        assertThat(client.connectionCalls).isZero();
    }

    private static void assertValidPluginUpscale(Map<String, Object> bindingConfig) {
        StubClient client = readyClient();
        WorkflowAiCapabilityPreflightService service = new WorkflowAiCapabilityPreflightService(client);
        WorkflowNodeDTO upscale = upscale(withGraph(bindingConfig));

        service.validate(definition(upscale), 7L);

        assertThat(client.lastConnectionRequest).isNotNull();
        assertThat(client.lastConnectionRequest.nodes()).hasSize(1);
        assertThat(client.lastConnectionRequest.nodes().get(0).nodeType()).isEqualTo("UPSCALE");
        assertThat(client.lastConnectionRequest.nodes().get(0).workflowNodeTypes())
                .containsExactlyInAnyOrder("LoadImage", "AcmeSuperResolution", "SaveImage");
    }

    private static Map<String, Object> withGraph(Map<String, Object> values) {
        java.util.LinkedHashMap<String, Object> config = new java.util.LinkedHashMap<>(values);
        config.put("provider", "COMFYUI");
        config.put("connectionId", "working-connection");
        config.put("workflowJson", PLUGIN_GRAPH);
        return config;
    }

    private static StubClient readyClient() {
        return new StubClient();
    }

    private static WorkflowNodeDTO upscale(Map<String, Object> config) {
        return node("upscale-1", "UPSCALE", config);
    }

    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setConfig(config);
        return node;
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO node) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("upscale preflight");
        definition.setNodes(List.of(node));
        return definition;
    }

    private static final class StubClient implements AiWorkflowNodeClient {
        private final AiWorkflowCapabilitiesDTO capabilities = new AiWorkflowCapabilitiesDTO(
                true, false, false, List.of(), List.of("COMFYUI"), List.of("UPSCALE", "IMAGE_GENERATION"),
                List.of(), Map.of());
        private int capabilityCalls;
        private int connectionCalls;
        private NodeConnectionValidationRequest lastConnectionRequest;

        @Override
        public Result<AiWorkflowCapabilitiesDTO> capabilities() {
            capabilityCalls++;
            return Result.success(capabilities);
        }

        @Override
        public Result<NodeConnectionValidationResponse> validateConnections(NodeConnectionValidationRequest request) {
            connectionCalls++;
            lastConnectionRequest = request;
            return Result.success(new NodeConnectionValidationResponse(List.of()));
        }

        @Override
        public Result<AiWorkflowNodeResponseDTO> execute(AiWorkflowNodeRequestDTO request) {
            return Result.success();
        }
    }
}
