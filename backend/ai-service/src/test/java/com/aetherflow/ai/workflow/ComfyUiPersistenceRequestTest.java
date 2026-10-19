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
    @Test void objectTextAndLegacyAliasesDecodeEquallyWithoutLosingBindings() throws Exception {
        var graph=Map.of("n",Map.of("class_type","PluginCustom","inputs",Map.of("text","synthetic")));
        var bindings=List.of(Map.of("nodeId","n","inputName","text","parameter","prompt"));
        for(var representation:List.of(Map.of("workflowJson",(Object)graph),Map.of("workflowJson",(Object)new ObjectMapper().writeValueAsString(graph)),
                Map.of("workflow",(Object)graph),Map.of("workflow",(Object)new ObjectMapper().writeValueAsString(graph)))) {
            var payload=new java.util.LinkedHashMap<String,Object>(representation);payload.put("provider","COMFYUI");payload.put("workflowBindings",bindings);
            var executor=new CapturingGeneration();executor.execute(new AiNodeExecutionContext(null,payload));
            assertThat(executor.request.workflowJson()).isEqualTo(graph);assertThat(executor.request.options()).containsEntry("workflowBindings",bindings);
            assertThat(payload).containsAllEntriesOf(representation);
        }
        var invalid=new CapturingGeneration();
        org.assertj.core.api.Assertions.assertThatThrownBy(()->invalid.execute(new AiNodeExecutionContext(null,Map.of("provider","COMFYUI","workflowJson","{invalid"))))
                .isInstanceOf(com.aetherflow.common.exception.BusinessException.class);
        assertThat(invalid.request).isNull();
    }
    @Test
    void bothExecutorsKeepThePersistedObjectAsAnAiRequestMap() throws Exception {
        var graph = Map.of("1", Map.of("class_type", "CLIPTextEncode", "inputs", Map.of("text", "中文", "link", List.of("2", 0))));
        var json = new ObjectMapper();
        // 使用真实 HTTP JSON 编解码后送达 AI 服务的对象结构。
        var bindings = List.of(Map.of("nodeId", "1", "inputName", "text", "parameter", "prompt"));
        Map<String, Object> payload = json.readValue(json.writeValueAsBytes(Map.of("provider", "COMFYUI", "workflowJson", graph, "workflowBindings", bindings)), new TypeReference<>() {});
        var generation = new CapturingGeneration();
        var upscale = new CapturingUpscale();
        generation.execute(new AiNodeExecutionContext(null, payload));
        upscale.execute(new AiNodeExecutionContext(null, payload));
        assertThat(generation.request.workflowJson()).isEqualTo(graph);
        assertThat(generation.request.options()).containsEntry("workflowBindings", bindings);
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
