package com.aetherflow.workflow.importer;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.util.ComfyUiWorkflow;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ComfyUiWorkflowLosslessTextTest {

    private static final String SOURCE = "\uFEFF {\n"
            + "  \"sampler\": {\"class_type\":\"KSampler\",\"inputs\":{"
            + "\"seed\":9007199254740993,\"noise_seed\":18446744073709551615,\"steps\":30,"
            + "\"text\":\"café\",\"nfd\":\"é\"},\"_meta\":{\"title\":\"保留原样\"}}\n"
            + "}\n";

    @Test
    void importRetainsOriginalJsonTextAcrossDefinitionSerializationAndReload() throws Exception {
        ComfyUiWorkflowImportService service = new ComfyUiWorkflowImportService();
        WorkflowDefinitionDTO imported = service.importWorkflow("lossless", "test", null, SOURCE);

        WorkflowNodeDTO image = imported.getNodes().stream()
                .filter(node -> "IMAGE_GENERATION".equals(node.getNodeType()))
                .findFirst().orElseThrow();
        assertThat(image.getConfig()).containsEntry("workflow", SOURCE).containsEntry("workflowJson", SOURCE);

        // 模拟 WorkflowService 将定义序列化为 JSON 文本并反序列化为相同 DTO 结构。
        ObjectMapper json = new ObjectMapper();
        WorkflowDefinitionDTO reloaded = json.readValue(json.writeValueAsBytes(imported), WorkflowDefinitionDTO.class);
        WorkflowNodeDTO reloadedImage = reloaded.getNodes().stream()
                .filter(node -> "IMAGE_GENERATION".equals(node.getNodeType()))
                .findFirst().orElseThrow();
        assertThat(reloadedImage.getConfig()).containsEntry("workflow", SOURCE).containsEntry("workflowJson", SOURCE);

        Map<String, Object> graph = ComfyUiWorkflow.executionGraph(reloadedImage.getConfig());
        Map<?, ?> sampler = (Map<?, ?>) graph.get("sampler");
        Map<?, ?> inputs = (Map<?, ?>) sampler.get("inputs");
        assertThat(inputs.get("seed")).isEqualTo(9_007_199_254_740_993L);
        assertThat(inputs.get("noise_seed")).isEqualTo(new BigInteger("18446744073709551615"));
        assertThat(inputs.get("noise_seed")).isInstanceOf(BigInteger.class);
        assertThat(inputs.get("steps")).isEqualTo(30).isInstanceOf(Integer.class);
        assertThat(inputs.get("text")).isEqualTo("café");
        assertThat(inputs.get("nfd")).isEqualTo("é");
        assertThat(((Map<?, ?>) sampler.get("_meta")).get("title")).isEqualTo("保留原样");
    }

    @Test
    void legacyObjectInputStillUsesObjectRepresentation() {
        Map<String, Object> graph = Map.of("1", Map.of("class_type", "KSampler", "inputs", Map.of("seed", 1234L)));
        WorkflowDefinitionDTO imported = new ComfyUiWorkflowImportService()
                .importWorkflow("legacy", "test", null, graph);
        WorkflowNodeDTO image = imported.getNodes().stream()
                .filter(node -> "IMAGE_GENERATION".equals(node.getNodeType()))
                .findFirst().orElseThrow();
        assertThat(image.getConfig()).containsEntry("workflow", graph).containsEntry("workflowJson", graph);
    }
}
