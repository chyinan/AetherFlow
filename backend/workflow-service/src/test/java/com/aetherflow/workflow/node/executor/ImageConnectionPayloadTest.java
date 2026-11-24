package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class ImageConnectionPayloadTest {
    @Test
    void preciseSeedTextBecomesAnExactLongInTheAiPayload() {
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task", Map.of());
        for (long seed : new long[]{9_007_199_254_740_993L, Long.MAX_VALUE}) {
            assertThat(ImageWorkflowNodeSupport.imageGenerationPayload(
                    Map.of("provider", "COMFYUI", "seed", Long.toString(seed)), context))
                    .containsEntry("seed", seed);
        }
        assertThat(ImageWorkflowNodeSupport.imageGenerationPayload(
                Map.of("provider", "COMFYUI", "seed", -1), context)).containsEntry("seed", -1L);
    }

    @Test
    void bothImagePathsPreserveConnectionReferenceWithoutEndpoint() {
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task", Map.of());
        Map<String, Object> config = Map.of("connectionId", "saved-one", "provider", "COMFYUI",
                "prompt", "sample", "baseUrl", "http://must-not-be-forwarded.invalid", "workflowBindings", java.util.List.of(Map.of("nodeId", "one", "inputName", "steps", "parameter", "steps")));
        assertThat(ImageWorkflowNodeSupport.imageGenerationPayload(config, context))
                .containsEntry("connectionId", "saved-one").containsEntry("workflowBindings", config.get("workflowBindings")).doesNotContainKey("baseUrl");
        assertThat(ImageWorkflowNodeSupport.upscalePayload(config, context))
                .containsEntry("connectionId", "saved-one").doesNotContainKey("baseUrl");
        assertThat(ImageWorkflowNodeSupport.imageGenerationPayload(Map.of("provider", "COMFYUI"), context))
                .doesNotContainKey("connectionId");
    }
}
