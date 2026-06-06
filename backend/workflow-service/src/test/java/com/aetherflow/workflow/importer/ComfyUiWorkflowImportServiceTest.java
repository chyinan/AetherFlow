package com.aetherflow.workflow.importer;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ComfyUiWorkflowImportServiceTest {

    @Test
    void convertsComfyUiApiWorkflowToAetherFlowImageDag() {
        ComfyUiWorkflowImportService service = new ComfyUiWorkflowImportService();

        WorkflowDefinitionDTO definition = service.importWorkflow("Imported SDXL", "Comfy export", 12L, workflow());

        assertThat(definition.getName()).isEqualTo("Imported SDXL");
        assertThat(definition.getProjectId()).isEqualTo(12L);
        assertThat(definition.getNodes())
                .extracting(WorkflowNodeDTO::getNodeType)
                .containsExactly("START", "PROMPT", "IMAGE_GENERATION", "END");

        WorkflowNodeDTO prompt = node(definition, "PROMPT");
        assertThat(prompt.getConfig())
                .containsEntry("prompt", "cinematic product photo")
                .containsEntry("negativePrompt", "blur, low quality");

        WorkflowNodeDTO image = node(definition, "IMAGE_GENERATION");
        assertThat(image.getConfig())
                .containsEntry("provider", "COMFYUI")
                .containsEntry("mode", "workflow")
                .containsEntry("promptVariable", "prompt")
                .containsEntry("negativePromptVariable", "negativePrompt")
                .containsEntry("seed", 1234L)
                .containsEntry("steps", 30)
                .containsEntry("cfgScale", 7.5D)
                .containsEntry("sampler", "dpmpp_2m")
                .containsEntry("scheduler", "karras")
                .containsEntry("width", 1024)
                .containsEntry("height", 1024)
                .containsEntry("batchSize", 2)
                .containsEntry("denoiseStrength", 0.65D)
                .containsEntry("checkpoint", "sdxl.safetensors")
                .containsEntry("vae", "sdxl-vae.safetensors");
        assertThat(image.getConfig().get("workflow")).isInstanceOf(Map.class);
        assertThat((List<?>) image.getConfig().get("lora"))
                .singleElement()
                .satisfies(item -> assertThat((Map<String, Object>) item)
                        .containsEntry("name", "product-style.safetensors")
                        .containsEntry("weight", 0.8D));
    }

    private static WorkflowNodeDTO node(WorkflowDefinitionDTO definition, String type) {
        return definition.getNodes().stream()
                .filter(node -> type.equals(node.getNodeType()))
                .findFirst()
                .orElseThrow();
    }

    private static Map<String, Object> workflow() {
        return Map.of(
                "1", Map.of(
                        "class_type", "CheckpointLoaderSimple",
                        "inputs", Map.of("ckpt_name", "sdxl.safetensors")
                ),
                "2", Map.of(
                        "class_type", "VAELoader",
                        "inputs", Map.of("vae_name", "sdxl-vae.safetensors")
                ),
                "3", Map.of(
                        "class_type", "LoraLoader",
                        "inputs", Map.of("lora_name", "product-style.safetensors", "strength_model", 0.8)
                ),
                "4", Map.of(
                        "class_type", "CLIPTextEncode",
                        "inputs", Map.of("text", "cinematic product photo")
                ),
                "5", Map.of(
                        "class_type", "CLIPTextEncode",
                        "inputs", Map.of("text", "blur, low quality")
                ),
                "6", Map.of(
                        "class_type", "EmptyLatentImage",
                        "inputs", Map.of("width", 1024, "height", 1024, "batch_size", 2)
                ),
                "7", Map.of(
                        "class_type", "KSampler",
                        "inputs", Map.of(
                                "seed", 1234L,
                                "steps", 30,
                                "cfg", 7.5,
                                "sampler_name", "dpmpp_2m",
                                "scheduler", "karras",
                                "denoise", 0.65,
                                "positive", List.of("4", 0),
                                "negative", List.of("5", 0),
                                "latent_image", List.of("6", 0)
                        )
                )
        );
    }
}
