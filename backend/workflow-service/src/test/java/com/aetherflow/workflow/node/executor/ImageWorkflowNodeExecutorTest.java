package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ImageWorkflowNodeExecutorTest {

    @Test
    void promptNodeWritesPromptVariables() throws Exception {
        PromptNodeExecutor executor = new PromptNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("prompt", Map.of(
                "prompt", "cinematic product photo",
                "negativePrompt", "blur, low quality",
                "stylePreset", "commerce"
        ), Map.of()));

        assertThat(result.output()).containsEntry("prompt", "cinematic product photo");
        assertThat(result.variables()).containsEntry("prompt", "cinematic product photo");
        assertThat(result.variables()).containsEntry("negativePrompt", "blur, low quality");
        assertThat(result.variables()).containsKey("promptMetadata");
    }

    @Test
    void imageGenerationNodeCallsAiServiceStoresImagesAndWritesRuntimeVariables() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        ImageGenerationNodeExecutor executor =
                new ImageGenerationNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage);
        FileMetadataDTO metadata = fileMetadata(7L, "workflow/images/a.png", "http://minio/a.png");
        when(storage.store(eq("workflow-1"), eq("image"), eq(99L), argThat(image ->
                "image.png".equals(image.getFileName())
                        && "aW1hZ2U=".equals(image.getBase64Data())
        ))).thenReturn(metadata);
        when(aiClient.execute(argThat(request -> "IMAGE_GENERATION".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "IMAGE_GENERATION",
                        "SUCCEEDED",
                        Map.of(
                                "provider", "SD_WEBUI",
                                "mode", "txt2img",
                                "images", List.of(Map.of(
                                        "fileName", "image.png",
                                        "contentType", "image/png",
                                        "base64Data", "aW1hZ2U="
                                )),
                                "metadata", Map.of("seed", 1234)
                        )
                )));

        NodeResult result = executor.execute(context("image", mapOf(
                "provider", "SD_WEBUI",
                "mode", "txt2img",
                "promptVariable", "prompt",
                "negativePromptVariable", "negativePrompt",
                "seed", 1234,
                "steps", 30,
                "cfgScale", 7.5,
                "sampler", "DPM++ 2M",
                "scheduler", "karras",
                "width", 1024,
                "height", 1024,
                "batchSize", 1,
                "checkpoint", "sdxl.safetensors",
                "vae", "sdxl-vae.safetensors",
                "lora", List.of(Map.of("name", "product-style", "weight", 0.8))
        ), Map.of(
                "prompt", "cinematic product photo",
                "negativePrompt", "blur",
                "userId", 99L
        )));

        assertThat(result.output()).containsEntry("provider", "SD_WEBUI");
        assertThat(result.variables()).containsEntry("provider", "SD_WEBUI");
        assertThat(result.variables()).containsEntry("mode", "txt2img");
        assertThat(result.variables()).containsEntry("imageFileIds", List.of(7L));
        assertThat(result.variables()).containsEntry("imageUrls", List.of("http://minio/a.png"));
        assertThat(result.variables()).containsEntry("imageObjectKeys", List.of("workflow/images/a.png"));
        assertThat(result.variables()).containsKey("imageFiles");
        assertThat(result.variables()).containsKey("imageGenerationMetadata");
        verify(aiClient).execute(argThat(request ->
                "IMAGE_GENERATION".equals(request.getNodeType())
                        && "cinematic product photo".equals(request.getPayload().get("prompt"))
                        && "blur".equals(request.getPayload().get("negativePrompt"))
                        && "SD_WEBUI".equals(request.getPayload().get("provider"))
                        && "sdxl.safetensors".equals(request.getPayload().get("checkpoint"))
        ));
    }

    @Test
    void upscaleNodeCallsAiServiceStoresImagesAndWritesRuntimeVariables() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        UpscaleNodeExecutor executor = new UpscaleNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage);
        when(storage.store(eq("workflow-1"), eq("upscale"), eq(100L), argThat(image ->
                "upscaled.png".equals(image.getFileName())
        ))).thenReturn(fileMetadata(8L, "workflow/images/upscaled.png", "http://minio/upscaled.png"));
        when(aiClient.execute(argThat(request -> "UPSCALE".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "UPSCALE",
                        "SUCCEEDED",
                        Map.of(
                                "provider", "COMFYUI",
                                "mode", "upscale",
                                "images", List.of(Map.of(
                                        "fileName", "upscaled.png",
                                        "contentType", "image/png",
                                        "base64Data", "aW1hZ2U="
                                )),
                                "metadata", Map.of("scale", 2)
                        )
                )));

        NodeResult result = executor.execute(context("upscale", Map.of(
                "provider", "COMFYUI",
                "sourceImageVariable", "sourceImage",
                "scale", 2
        ), Map.of(
                "sourceImage", "aW1hZ2U=",
                "userId", 100L
        )));

        assertThat(result.variables()).containsEntry("upscaledImageFileIds", List.of(8L));
        assertThat(result.variables()).containsEntry("upscaledImageUrls", List.of("http://minio/upscaled.png"));
        assertThat(result.variables()).containsKey("upscaleMetadata");
        verify(aiClient).execute(argThat(request ->
                "UPSCALE".equals(request.getNodeType())
                        && "aW1hZ2U=".equals(request.getPayload().get("sourceImage"))
                        && "COMFYUI".equals(request.getPayload().get("provider"))
        ));
    }

    @Test
    void saveImageNodeStoresImagesFromWorkflowVariables() throws Exception {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        SaveImageNodeExecutor executor = new SaveImageNodeExecutor(new WorkflowNodeMetrics(), storage);
        when(storage.store(eq("workflow-1"), eq("save"), eq(101L), argThat(image ->
                "manual.png".equals(image.getFileName())
        ))).thenReturn(fileMetadata(9L, "workflow/images/manual.png", "http://minio/manual.png"));

        NodeResult result = executor.execute(context("save", Map.of(
                "imagesVariable", "generatedImages"
        ), Map.of(
                "generatedImages", List.of(Map.of(
                        "fileName", "manual.png",
                        "contentType", "image/png",
                        "base64Data", "aW1hZ2U="
                )),
                "userId", 101L
        )));

        assertThat(result.variables()).containsEntry("savedImageFileIds", List.of(9L));
        assertThat(result.variables()).containsEntry("savedImageUrls", List.of("http://minio/manual.png"));
        assertThat(result.output()).containsKey("imageFiles");
    }

    private static DefaultWorkflowContext context(String nodeId,
                                                  Map<String, Object> config,
                                                  Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of(nodeId, config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId(nodeId);
        return context;
    }

    private static FileMetadataDTO fileMetadata(Long id, String objectKey, String url) {
        return new FileMetadataDTO(
                id,
                "aetherflow",
                objectKey,
                objectKey.substring(objectKey.lastIndexOf('/') + 1),
                "image/png",
                5L,
                url
        );
    }

    private static Map<String, Object> mapOf(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return map;
    }
}
