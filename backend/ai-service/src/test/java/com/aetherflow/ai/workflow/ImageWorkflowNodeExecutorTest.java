package com.aetherflow.ai.workflow;

import com.aetherflow.ai.image.GeneratedImagePayload;
import com.aetherflow.ai.image.ImageGenerationProvider;
import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.workflow.executor.ImageGenerationAiNodeExecutor;
import com.aetherflow.ai.workflow.executor.PromptAiNodeExecutor;
import com.aetherflow.ai.workflow.executor.UpscaleAiNodeExecutor;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ImageWorkflowNodeExecutorTest {

    @Test
    void promptExecutorNormalizesPromptOutput() {
        PromptAiNodeExecutor executor = new PromptAiNodeExecutor();

        AiNodeResult result = executor.execute(new AiNodeExecutionContext(null, Map.of(
                "prompt", "cat",
                "negativePrompt", "blur"
        )));

        assertThat(result.nodeType()).isEqualTo("PROMPT");
        assertThat(result.status()).isEqualTo("SUCCEEDED");
        assertThat(result.output())
                .containsEntry("prompt", "cat")
                .containsEntry("negativePrompt", "blur")
                .containsKey("metadata");
        assertThat(result.artifacts()).isEmpty();
    }

    @Test
    void imageGenerationExecutorMapsPayloadAndReturnsImages() {
        CapturingProvider provider = new CapturingProvider();
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(
                new ImageProviderRegistry(List.of(provider))
        );

        AiNodeResult result = executor.execute(new AiNodeExecutionContext(null, imageGenerationPayload()));

        assertThat(provider.lastRequest).isNotNull();
        assertThat(provider.lastRequest.provider()).isEqualTo(ImageProviderType.COMFYUI);
        assertThat(provider.lastRequest.mode()).isEqualTo("img2img");
        assertThat(provider.lastRequest.prompt()).isEqualTo("cat");
        assertThat(provider.lastRequest.negativePrompt()).isEqualTo("blur");
        assertThat(provider.lastRequest.seed()).isEqualTo(7L);
        assertThat(provider.lastRequest.steps()).isEqualTo(20);
        assertThat(provider.lastRequest.cfgScale()).isEqualTo(6.5);
        assertThat(provider.lastRequest.width()).isEqualTo(768);
        assertThat(provider.lastRequest.height()).isEqualTo(1024);
        assertThat(provider.lastRequest.batchSize()).isEqualTo(2);
        assertThat(provider.lastRequest.denoiseStrength()).isEqualTo(0.45);
        assertThat(provider.lastRequest.checkpoint()).isEqualTo("sdxl.safetensors");
        assertThat(provider.lastRequest.vae()).isEqualTo("ae.safetensors");
        assertThat(provider.lastRequest.lora()).hasSize(1);
        assertThat(provider.lastRequest.sourceImageBase64()).isEqualTo("c291cmNl");
        assertThat(provider.lastRequest.sourceImageContentType()).isEqualTo("image/png");
        assertThat(provider.lastRequest.workflowJson()).containsKey("1");
        assertThat(provider.lastRequest.options()).containsEntry("client_id", "workflow");
        assertThat(provider.lastRequest.timeout()).isEqualTo(Duration.ofSeconds(12));

        assertThat(result.nodeType()).isEqualTo("IMAGE_GENERATION");
        assertThat(result.status()).isEqualTo("SUCCEEDED");
        assertThat(result.output()).containsKeys("provider", "mode", "images", "metadata");
        assertThat(result.output().get("images")).asList().hasSize(1);
    }

    @Test
    void imageGenerationExecutorSupportsStableDiffusionAlias() {
        CapturingProvider provider = new CapturingProvider(ImageProviderType.STABLE_DIFFUSION_WEBUI);
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(
                new ImageProviderRegistry(List.of(provider))
        );

        executor.execute(new AiNodeExecutionContext(null, Map.of(
                "provider", "SD_WEBUI",
                "prompt", "cat"
        )));

        assertThat(provider.lastRequest.provider()).isEqualTo(ImageProviderType.STABLE_DIFFUSION_WEBUI);
    }

    @Test
    void upscaleExecutorUsesProviderUpscaleMode() {
        CapturingProvider provider = new CapturingProvider();
        UpscaleAiNodeExecutor executor = new UpscaleAiNodeExecutor(new ImageProviderRegistry(List.of(provider)));

        AiNodeResult result = executor.execute(new AiNodeExecutionContext(null, Map.of(
                "provider", "COMFYUI",
                "sourceImageBase64", "aW1n",
                "sourceImageContentType", "image/png",
                "scale", 4,
                "denoiseStrength", 0.25
        )));

        assertThat(provider.upscaleCalled).isTrue();
        assertThat(provider.lastRequest.mode()).isEqualTo("upscale");
        assertThat(provider.lastRequest.options()).containsEntry("scale", 4);
        assertThat(provider.lastRequest.denoiseStrength()).isEqualTo(0.25);
        assertThat(result.nodeType()).isEqualTo("UPSCALE");
        assertThat(result.output()).containsEntry("mode", "upscale");
    }

    private static final class CapturingProvider implements ImageGenerationProvider {
        private final ImageProviderType type;
        private ImageGenerationRequest lastRequest;
        private boolean upscaleCalled;

        private CapturingProvider() {
            this(ImageProviderType.COMFYUI);
        }

        private CapturingProvider(ImageProviderType type) {
            this.type = type;
        }

        @Override
        public ImageProviderType type() {
            return type;
        }

        @Override
        public ImageGenerationResponse generate(ImageGenerationRequest request) {
            this.lastRequest = request;
            return response(request.mode());
        }

        @Override
        public ImageGenerationResponse upscale(ImageGenerationRequest request) {
            this.lastRequest = request;
            this.upscaleCalled = true;
            return response("upscale");
        }

        private ImageGenerationResponse response(String mode) {
            return new ImageGenerationResponse(type().name(), mode,
                    List.of(new GeneratedImagePayload("image.png", "image/png", "aW1hZ2U=", 5L, Map.of())),
                    Map.of("seed", lastRequest == null || lastRequest.seed() == null ? -1 : lastRequest.seed()));
        }
    }

    private Map<String, Object> imageGenerationPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("provider", "COMFYUI");
        payload.put("mode", "img2img");
        payload.put("prompt", "cat");
        payload.put("negativePrompt", "blur");
        payload.put("seed", 7);
        payload.put("steps", "20");
        payload.put("cfgScale", "6.5");
        payload.put("sampler", "euler");
        payload.put("scheduler", "normal");
        payload.put("width", 768);
        payload.put("height", 1024);
        payload.put("batchSize", 2);
        payload.put("denoiseStrength", 0.45);
        payload.put("checkpoint", "sdxl.safetensors");
        payload.put("vae", "ae.safetensors");
        payload.put("lora", List.of(Map.of("name", "style.safetensors", "weight", 0.7)));
        payload.put("sourceImageBase64", "c291cmNl");
        payload.put("sourceImageContentType", "image/png");
        payload.put("workflowJson", Map.of("1", Map.of("class_type", "KSampler")));
        payload.put("options", Map.of("client_id", "workflow"));
        payload.put("timeoutSeconds", 12);
        return payload;
    }
}
