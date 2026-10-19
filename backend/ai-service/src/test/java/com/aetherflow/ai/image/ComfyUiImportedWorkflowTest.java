package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class ComfyUiImportedWorkflowTest {
    private final ComfyUiProvider provider = new ComfyUiProvider((RestClient)null, new ImageProviderProperties(), () -> { throw new AssertionError("未绑定种子不能抽取随机数"); });
    private Map<String,Object> graph() {
        return Map.of("first", Map.of("class_type", "KSampler", "inputs", Map.of("steps", 30, "seed", 11L, "positive", List.of("plugin", 0))),
                "second", Map.of("class_type", "KSampler", "inputs", Map.of("steps", 20, "seed", 22L)),
                "plugin", Map.of("class_type", "ExamplePluginText", "inputs", Map.of("text", "synthetic"), "_meta", Map.of("title", "Plugin UI")));
    }
    private ImageGenerationRequest request(Map<String,Object> graph, Object bindings) {
        return new ImageGenerationRequest(ImageProviderType.COMFYUI, "workflow", "new positive", "new negative", -1L,
                9, 8.0, "euler", "normal", 512, 512, 1, 0.5, "unbound.safetensors", null, List.of(), null, null,
                graph, bindings == null ? Map.of() : Map.of("workflowBindings", bindings), null);
    }
    @SuppressWarnings("unchecked")
    private Map<String,Object> prepare(ImageGenerationRequest request) throws Exception {
        var method = ComfyUiProvider.class.getDeclaredMethod("queuePayload", ImageGenerationRequest.class, String.class, ComfyUiProvider.ComfyUploadResponse.class);
        method.setAccessible(true);
        return (Map<String,Object>)method.invoke(provider, request, "workflow", null);
    }
    @Test void preservesUnknownPluginsReferencesMetadataAndDistinctStagesByDefault() throws Exception {
        Map<String,Object> original = graph();
        assertThat(prepare(request(original, null)).get("prompt")).isEqualTo(original);
        assertThat(original).isEqualTo(graph());
    }
    @Test void overridesOnlyExplicitInputAndDoesNotLeakInternalBindings() throws Exception {
        Map<String,Object> original = graph();
        Map<String,Object> payload = prepare(request(original, List.of(Map.of("nodeId", "second", "inputName", "steps", "parameter", "steps"))));
        Map<?,?> graph = (Map<?,?>)payload.get("prompt");
        assertThat(graph.get("first")).isEqualTo(original.get("first"));
        assertThat(graph.get("plugin")).isEqualTo(original.get("plugin"));
        assertThat((Map<?,?>)((Map<?,?>)graph.get("second")).get("inputs")).isEqualTo(Map.of("steps", 9, "seed", 22L));
        assertThat(payload).doesNotContainKey("workflowBindings");
        assertThat(original).isEqualTo(graph());
    }
    @Test void blocksUiBeforeAnyClientOrUploadAndGivesConversionStep() {
        var ui = Map.<String,Object>of("nodes", List.of(Map.of("id",1,"type","CustomPlugin")), "links", List.of());
        assertThatThrownBy(() -> provider.generate(request(ui, null))).isInstanceOf(BusinessException.class).hasMessageContaining("导出 API 格式");
    }
    @Test void rejectsMissingOrDuplicateTargetsBeforeAnyClient() {
        var binding = Map.of("nodeId", "second", "inputName", "missing", "parameter", "steps");
        assertThatThrownBy(() -> provider.generate(request(graph(), List.of(binding)))).isInstanceOf(BusinessException.class).hasMessageContaining("绑定目标不存在");
        var valid = Map.of("nodeId", "second", "inputName", "steps", "parameter", "steps");
        assertThatThrownBy(() -> provider.generate(request(graph(), List.of(valid,valid)))).isInstanceOf(BusinessException.class).hasMessageContaining("重复绑定");
    }
}
