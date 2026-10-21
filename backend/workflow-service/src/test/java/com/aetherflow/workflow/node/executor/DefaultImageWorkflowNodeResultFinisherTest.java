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
}
