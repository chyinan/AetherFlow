package com.aetherflow.workflow.preflight;

import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowAiCapabilityPolicyTest {

    @Test
    void rejectsUnavailableLlmBeforeWorkflowInstanceCreation() {
        WorkflowDefinitionDTO definition = definition(node("llm", "LLM", Map.of("provider", "OLLAMA")));
        AiWorkflowCapabilitiesDTO capabilities = capabilities(
                false,
                false,
                List.of(),
                List.of(),
                Map.of("LLM", "llm runtime is disabled")
        );

        List<String> violations = WorkflowAiCapabilityPolicy.validate(definition, capabilities);

        assertThat(violations).containsExactly("node llm (LLM): llm runtime is disabled");
    }

    @Test
    void rejectsImageProviderThatIsNotEnabled() {
        WorkflowDefinitionDTO definition = definition(node(
                "image",
                "IMAGE_GENERATION",
                Map.of("provider", "SD_WEBUI")
        ));
        AiWorkflowCapabilitiesDTO capabilities = capabilities(
                true,
                true,
                List.of("OLLAMA"),
                List.of("COMFYUI"),
                Map.of()
        );

        List<String> violations = WorkflowAiCapabilityPolicy.validate(definition, capabilities);

        assertThat(violations)
                .containsExactly("node image (IMAGE_GENERATION): image provider STABLE_DIFFUSION_WEBUI is not enabled");
    }

    @Test
    void acceptsAliasesWhenSelectedProvidersAreExecutable() {
        WorkflowDefinitionDTO definition = definition(
                node("llm", "SUMMARY", Map.of("provider", "ollama")),
                node("image", "IMAGE_GENERATION", Map.of("provider", "sd_webui")),
                node("asr", "WHISPER", Map.of())
        );
        AiWorkflowCapabilitiesDTO capabilities = capabilities(
                true,
                true,
                List.of("OLLAMA"),
                List.of("STABLE_DIFFUSION_WEBUI"),
                Map.of()
        );

        assertThat(WorkflowAiCapabilityPolicy.validate(definition, capabilities)).isEmpty();
    }

    private static AiWorkflowCapabilitiesDTO capabilities(
            boolean llmExecutable,
            boolean whisperExecutable,
            List<String> llmProviders,
            List<String> imageProviders,
            Map<String, String> unavailableReasons) {
        return new AiWorkflowCapabilitiesDTO(
                true,
                llmExecutable,
                whisperExecutable,
                llmProviders,
                imageProviders,
                List.of("IMAGE_GENERATION", "LLM", "SUMMARY", "WHISPER"),
                List.of("IMAGE_GENERATION", "LLM", "SUMMARY", "WHISPER"),
                unavailableReasons
        );
    }

    private static WorkflowDefinitionDTO definition(WorkflowNodeDTO... nodes) {
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("capability-test");
        definition.setNodes(List.of(nodes));
        return definition;
    }

    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setConfig(config);
        return node;
    }
}
