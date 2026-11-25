package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.runtime.api.NodeResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class DefaultImageWorkflowNodeResultFinisherTest {

    @Test
    void reusesAiServiceStoredArtifactMetadataWithoutReintroducingBase64Storage() {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        DefaultImageWorkflowNodeResultFinisher finisher = new DefaultImageWorkflowNodeResultFinisher(storage);
        Map<String, Object> output = Map.of(
                "provider", "COMFYUI",
                "mode", "txt2img",
                "artifactFiles", List.of(Map.of("id", 77L, "objectKey", "tenant-7/image.png")),
                "imageFileIds", List.of(77L),
                "imageObjectKeys", List.of("tenant-7/image.png"),
                "imageUrls", List.of("https://files/image.png")
        );

        NodeResult result = finisher.finish("IMAGE_GENERATION", "1001", "node-image", Map.of("userId", 7L), output);

        assertThat(result.variables()).containsEntry("imageFileIds", List.of(77L));
        assertThat(result.variables()).containsEntry("imageObjectKeys", List.of("tenant-7/image.png"));
        verifyNoInteractions(storage);
    }

    @Test
    void storesEveryImageOfAFullBatchInsteadOfTruncatingToEight() {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        java.util.concurrent.atomic.AtomicLong ids = new java.util.concurrent.atomic.AtomicLong(100);
        when(storage.store(anyString(), anyString(), any(), any())).thenAnswer(invocation ->
                new com.aetherflow.common.dto.FileMetadataDTO(
                        ids.incrementAndGet(), "tenant", "generated/image.png", "image.png", "image/png", 4L,
                        "https://files/image.png"));
        DefaultImageWorkflowNodeResultFinisher finisher = new DefaultImageWorkflowNodeResultFinisher(storage);
        List<Map<String, Object>> images = new java.util.ArrayList<>();
        for (int index = 0; index < 16; index++) {
            images.add(Map.of("fileName", "image-" + index + ".png", "contentType", "image/png",
                    "base64Data", "aW1hZ2U="));
        }
        Map<String, Object> output = Map.of("provider", "COMFYUI", "mode", "txt2img", "images", images);

        NodeResult result = finisher.finish("IMAGE_GENERATION", "1001", "node-image", Map.of("userId", 7L), output);

        assertThat(result.variables().get("imageFileIds")).asList().hasSize(16);
        verify(storage, org.mockito.Mockito.times(16)).store(anyString(), anyString(), any(), any());
    }

    @Test
    void moreImagesThanSupportedIsAnExplicitFailureRatherThanSilentTruncation() {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        DefaultImageWorkflowNodeResultFinisher finisher = new DefaultImageWorkflowNodeResultFinisher(storage);
        List<Map<String, Object>> images = new java.util.ArrayList<>();
        for (int index = 0; index < 17; index++) {
            images.add(Map.of("fileName", "image-" + index + ".png", "contentType", "image/png",
                    "base64Data", "aW1hZ2U="));
        }
        Map<String, Object> output = Map.of("provider", "COMFYUI", "mode", "txt2img", "images", images);

        assertThatThrownBy(() -> finisher.finish("IMAGE_GENERATION", "1001", "node-image", Map.of("userId", 7L), output))
                .hasMessageContaining("more images than the supported limit");
        verifyNoInteractions(storage);
    }

    @Test
    void exposesTypedMediaAliasesBesideLegacyImageOutputsForMixedStoredArtifacts() {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        DefaultImageWorkflowNodeResultFinisher finisher = new DefaultImageWorkflowNodeResultFinisher(storage);
        Map<String, Object> image = Map.of("id", 77L, "objectKey", "tenant-7/image.png");
        Map<String, Object> media = Map.of("id", 78L, "objectKey", "tenant-7/voice.flac");
        Map<String, Object> output = Map.ofEntries(
                Map.entry("provider", "COMFYUI"),
                Map.entry("mode", "workflow"),
                Map.entry("metadata", Map.of("imageCount", 1, "mediaCount", 1)),
                Map.entry("artifactFiles", List.of(image, media)),
                Map.entry("artifactTypeBindings", List.of(Map.of("index", 0, "type", "image"),
                        Map.of("index", 1, "type", "media"))),
                Map.entry("imageFileIds", List.of(77L)),
                Map.entry("imageObjectKeys", List.of("tenant-7/image.png")),
                Map.entry("imageUrls", List.of("https://files/image.png")),
                Map.entry("mediaFileIds", List.of(78L)),
                Map.entry("mediaObjectKeys", List.of("tenant-7/voice.flac")),
                Map.entry("mediaUrls", List.of("https://files/voice.flac")),
                Map.entry("mediaUrl", "https://files/voice.flac")
        );

        NodeResult result = finisher.finish("IMAGE_GENERATION", "1001", "node-image", Map.of("userId", 7L), output);

        assertThat(result.variables().get("imageFiles")).isEqualTo(List.of(image));
        assertThat(result.variables().get("mediaFiles")).isEqualTo(List.of(media));
        assertThat(result.variables()).containsEntry("mediaFileIds", List.of(78L))
                .containsEntry("mediaUrls", List.of("https://files/voice.flac"))
                .containsEntry("mediaUrl", "https://files/voice.flac")
                .containsEntry("fileUrl", "https://files/voice.flac")
                .containsEntry("imageUrls", List.of("https://files/image.png"));
        verifyNoInteractions(storage);
    }

    @Test
    void acceptsTextOnlyComfyOutputOnlyAfterExplicitSuccessfulTerminalStatus() {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        DefaultImageWorkflowNodeResultFinisher finisher = new DefaultImageWorkflowNodeResultFinisher(storage);
        Map<String, Object> output = Map.of(
                "provider", "COMFYUI",
                "mode", "workflow",
                "metadata", Map.of("comfyOutputMetadata", Map.of(
                        "terminalStatus", "success",
                        "outputs", Map.of("17", Map.of("text", List.of("hello from ComfyUI")))))
        );

        NodeResult result = finisher.finish("IMAGE_GENERATION", "1001", "node-image", Map.of("userId", 7L), output);

        assertThat(result.successful()).isTrue();
        assertThat(result.waiting()).isFalse();
        assertThat(result.variables()).containsEntry("imageFiles", List.of())
                .containsEntry("imageGenerationMetadata", output.get("metadata"));
        verifyNoInteractions(storage);
    }

    @Test
    void doesNotTurnStandardImageModeTextIntoMetadataOnlySuccess() {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        DefaultImageWorkflowNodeResultFinisher finisher = new DefaultImageWorkflowNodeResultFinisher(storage);
        Map<String, Object> output = Map.of(
                "provider", "COMFYUI",
                "mode", "txt2img",
                "metadata", Map.of("comfyOutputMetadata", Map.of(
                        "terminalStatus", "success",
                        "outputs", Map.of("17", Map.of("text", List.of("caption")))))
        );

        assertThatThrownBy(() -> finisher.finish("IMAGE_GENERATION", "1001", "node-image", Map.of("userId", 7L), output))
                .hasMessageContaining("returned no images");
        verifyNoInteractions(storage);
    }

    @Test
    void doesNotAcceptUnknownNonImageOutputWithoutSuccessfulTerminalStatus() {
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        DefaultImageWorkflowNodeResultFinisher finisher = new DefaultImageWorkflowNodeResultFinisher(storage);
        Map<String, Object> output = Map.of(
                "provider", "COMFYUI",
                "mode", "workflow",
                "metadata", Map.of("comfyOutputMetadata", Map.of(
                        "terminalStatus", "unknown", "outputs", Map.of("17", Map.of("text", List.of("hello")))))
        );

        assertThatThrownBy(() -> finisher.finish("IMAGE_GENERATION", "1001", "node-image", Map.of("userId", 7L), output))
                .hasMessageContaining("returned no images");
        verifyNoInteractions(storage);
    }
}
