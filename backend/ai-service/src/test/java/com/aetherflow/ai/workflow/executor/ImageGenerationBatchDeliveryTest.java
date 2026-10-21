package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.image.GeneratedImagePayload;
import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageGenerationProvider;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 工作流节点目录允许 batchSize 1–16，Provider 返回的图片必须完整交付，
 * 不能静默截断成 8 张。
 */
class ImageGenerationBatchDeliveryTest {

    @Test
    void deliversAllSixteenImagesWithTheirCount() {
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(
                registryReturning(16));

        var result = executor.execute(context());

        assertThat(result.artifacts()).hasSize(16);
        assertThat(result.output()).containsEntry("imageCount", 16);
        assertThat(result.artifacts().get(0).fileName()).isEqualTo("image-0.png");
        assertThat(result.artifacts().get(15).fileName()).isEqualTo("image-15.png");
    }

    @Test
    void deliversNineImagesInsteadOfTruncatingToEight() {
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(
                registryReturning(9));

        var result = executor.execute(context());

        assertThat(result.artifacts()).hasSize(9);
        assertThat(result.output()).containsEntry("imageCount", 9);
    }

    @Test
    void moreImagesThanSupportedIsAnExplicitFailureRatherThanSilentTruncation() {
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(
                registryReturning(17));

        assertThatThrownBy(() -> executor.execute(context()))
                .hasMessageContaining("more images than the supported limit");
    }

    @Test
    void blankImagePayloadStillFails() {
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(
                new ImageProviderRegistry(List.of(new ImageGenerationProvider() {
                    public ImageProviderType type() { return ImageProviderType.COMFYUI; }
                    public ImageGenerationResponse generate(ImageGenerationRequest request) {
                        return new ImageGenerationResponse("COMFYUI", request.mode(),
                                List.of(new GeneratedImagePayload("image.png", "image/png", "  ", 1L, Map.of())),
                                Map.of());
                    }
                    public ImageGenerationResponse upscale(ImageGenerationRequest request) {
                        return generate(request);
                    }
                })));

        assertThatThrownBy(() -> executor.execute(context()))
                .hasMessageContaining("blank image");
    }

    private static ImageProviderRegistry registryReturning(int imageCount) {
        return new ImageProviderRegistry(List.of(new ImageGenerationProvider() {
            public ImageProviderType type() { return ImageProviderType.COMFYUI; }
            public ImageGenerationResponse generate(ImageGenerationRequest request) {
                List<GeneratedImagePayload> images = new ArrayList<>();
                for (int index = 0; index < imageCount; index++) {
                    images.add(new GeneratedImagePayload("image-" + index + ".png", "image/png",
                            java.util.Base64.getEncoder().encodeToString(("image-" + index).getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                            1L, Map.of()));
                }
                return new ImageGenerationResponse("COMFYUI", request.mode(), images, Map.of());
            }
            public ImageGenerationResponse upscale(ImageGenerationRequest request) {
                return generate(request);
            }
        }));
    }

    private static AiNodeExecutionContext context() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(1L);
        message.setWorkflowInstanceId(2L);
        message.setUserId(3L);
        message.setNodeId("node-image");
        message.setNodeType("IMAGE_GENERATION");
        return new AiNodeExecutionContext(message, Map.of(
                "provider", "COMFYUI", "mode", "txt2img", "prompt", "cat"));
    }
}
