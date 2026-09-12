package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.runtime.api.NodeResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

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
}
