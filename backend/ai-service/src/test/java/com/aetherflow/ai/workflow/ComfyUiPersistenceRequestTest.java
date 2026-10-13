package com.aetherflow.ai.workflow;

import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.workflow.executor.ImageGenerationAiNodeExecutor;
import com.aetherflow.ai.workflow.executor.UpscaleAiNodeExecutor;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class ComfyUiPersistenceRequestTest {
    @Test
    void bothExecutorsKeepThePersistedObjectAsAnAiRequestMap() throws Exception {
        var graph = Map.of("1", Map.of("class_type", "CLIPTextEncode", "inputs", Map.of("text", "中文", "link", List.of("2", 0))));
        var json = new ObjectMapper();
        // 使用真实 HTTP JSON 编解码后送达 AI 服务的对象结构。
        Map<String, Object> payload = json.readValue(json.writeValueAsBytes(Map.of("provider", "COMFYUI", "workflowJson", graph)), new TypeReference<>() {});
        var generation = new CapturingGeneration();
        var upscale = new CapturingUpscale();
        generation.execute(new AiNodeExecutionContext(null, payload));
        upscale.execute(new AiNodeExecutionContext(null, payload));
        assertThat(generation.request.workflowJson()).isEqualTo(graph);
        assertThat(upscale.request.workflowJson()).isEqualTo(graph);
        assertThat(upscale.request.mode()).isEqualTo("upscale");
        assertThat(payload.get("workflowJson")).isEqualTo(graph);
    }

    private static class CapturingGeneration extends ImageGenerationAiNodeExecutor {
        private ImageGenerationRequest request;
        CapturingGeneration() { super(null); }
        @Override
        protected ImageGenerationResponse executeConfigured(AiNodeExecutionContext context, ImageGenerationRequest request, boolean upscale) {
            this.request = request;
            return new ImageGenerationResponse("COMFYUI", request.mode(), List.of(), Map.of());
        }
    }
    private static class CapturingUpscale extends UpscaleAiNodeExecutor {
        private ImageGenerationRequest request;
        CapturingUpscale() { super(null); }
        @Override
        protected ImageGenerationResponse executeConfigured(AiNodeExecutionContext context, ImageGenerationRequest request, boolean upscale) {
            this.request = request;
            return new ImageGenerationResponse("COMFYUI", request.mode(), List.of(), Map.of());
        }
    }
}
