package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class ImageConnectionPayloadTest {
    @Test
    void bothImagePathsPreserveConnectionReferenceWithoutEndpoint() {
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task", Map.of());
        Map<String, Object> config = Map.of("connectionId", "saved-one", "provider", "COMFYUI",
                "prompt", "sample", "baseUrl", "http://must-not-be-forwarded.invalid");
        assertThat(ImageWorkflowNodeSupport.imageGenerationPayload(config, context))
                .containsEntry("connectionId", "saved-one").doesNotContainKey("baseUrl");
        assertThat(ImageWorkflowNodeSupport.upscalePayload(config, context))
                .containsEntry("connectionId", "saved-one").doesNotContainKey("baseUrl");
        assertThat(ImageWorkflowNodeSupport.imageGenerationPayload(Map.of("provider", "COMFYUI"), context))
                .doesNotContainKey("connectionId");
    }
}
