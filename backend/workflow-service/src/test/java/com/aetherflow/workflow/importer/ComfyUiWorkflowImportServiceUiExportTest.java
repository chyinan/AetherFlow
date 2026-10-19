package com.aetherflow.workflow.importer;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ComfyUiWorkflowImportServiceUiExportTest {

    @Test
    void retainsUiWidgetsWithoutPretendingTheyAreApiInputs() {
        ComfyUiWorkflowImportService service = new ComfyUiWorkflowImportService();

        WorkflowDefinitionDTO definition = service.importWorkflow(
                "UI export",
                null,
                null,
                Map.of("nodes", List.of(
                        Map.of("id", 1, "type", "KSampler", "widgets_values", List.of(
                                1234L, "randomize", 30, 7.5, "dpmpp_2m", "karras", 0.65
                        ))
                ))
        );

        WorkflowNodeDTO image = definition.getNodes().stream()
                .filter(node -> "IMAGE_GENERATION".equals(node.getNodeType()))
                .findFirst()
                .orElseThrow();

        assertThat(image.getConfig()).containsKeys("workflow", "workflowJson", "comfyImport")
                .doesNotContainKeys("seed", "steps", "sampler", "denoiseStrength");
    }
}
