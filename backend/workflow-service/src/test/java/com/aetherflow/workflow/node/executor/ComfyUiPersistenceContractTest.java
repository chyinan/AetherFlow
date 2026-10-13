package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.importer.ComfyUiWorkflowImportService;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.node.validation.WorkflowNodeConfigValidator;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class ComfyUiPersistenceContractTest {
    @Test
    void importedObjectSurvivesSaveValidationAndBothAiPayloads() throws Exception {
        var graph = Map.of("1", Map.of("class_type", "CLIPTextEncode", "inputs", Map.of("text", "中文", "link", List.of("2", 0))));
        var definition = new ComfyUiWorkflowImportService().importWorkflow("导入", "说明", 11L, graph);
        var imported = definition.getNodes().stream().filter(node -> "IMAGE_GENERATION".equals(node.getNodeType())).findFirst().orElseThrow();
        // 模拟真实 HTTP JSON 编解码，不将对象变成 Java 的 toString 文本。
        var json = new ObjectMapper();
        var restored = json.readValue(json.writeValueAsBytes(imported), WorkflowNodeDTO.class);
        var catalog = new WorkflowNodeCatalogService().catalog();
        assertThat(WorkflowNodeConfigValidator.validate(restored, catalog)).isEmpty();
        assertThat(restored.getConfig().get("workflowJson")).isEqualTo(graph);
        var context = new DefaultWorkflowContext("workflow", "trace", "task", Map.of());
        assertThat(ImageWorkflowNodeSupport.imageGenerationPayload(restored.getConfig(), context).get("workflowJson")).isEqualTo(graph);
        var upscale = new WorkflowNodeDTO();
        upscale.setNodeId("upscale"); upscale.setNodeType("UPSCALE");
        upscale.setConfig(new LinkedHashMap<>(Map.of("provider", "COMFYUI", "workflowJson", restored.getConfig().get("workflowJson"))));
        assertThat(WorkflowNodeConfigValidator.validate(upscale, catalog)).isEmpty();
        assertThat(ImageWorkflowNodeSupport.upscalePayload(upscale.getConfig(), context).get("workflowJson")).isEqualTo(graph);
    }

    @Test
    void compatibilityIsLimitedToTheTwoImageWorkflowJsonFields() {
        var catalog = new WorkflowNodeCatalogService().catalog();
        for (String type : List.of("IMAGE_GENERATION", "UPSCALE")) {
            var node = new WorkflowNodeDTO(); node.setNodeId("image"); node.setNodeType(type);
            var config = new LinkedHashMap<String, Object>(Map.of("promptVariable", "prompt")); node.setConfig(config);
            for (Object allowed : List.of(Map.of(), Map.of("1", Map.of()), "{}", "")) {
                config.put("workflowJson", allowed);
                assertThat(WorkflowNodeConfigValidator.validate(node, catalog)).isEmpty();
            }
            for (Object rejected : List.of(List.of(), 7, true)) {
                config.put("workflowJson", rejected);
                assertThat(WorkflowNodeConfigValidator.validate(node, catalog)).anyMatch(value -> value.contains("workflowJson"));
            }
            config.put("workflowJson", Map.of()); config.put("provider", Map.of());
            assertThat(WorkflowNodeConfigValidator.validate(node, catalog)).anyMatch(value -> value.contains("'provider' must be STRING"));
        }
    }
}
