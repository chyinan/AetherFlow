package com.aetherflow.workflow.node.validation;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

class NodeConnectionConfigTest {
    private final WorkflowNodeCatalogService catalog = new WorkflowNodeCatalogService();

    @Test
    void savedConnectionKeepsDynamicModelOptionsForRuntimeValidation() {
        assertThat(WorkflowNodeConfigValidator.validate(node(Map.of("connectionId", "saved-one",
                "provider", "STABLE_DIFFUSION_WEBUI", "prompt", "sample", "sampler", "service-custom-sampler")),
                catalog.catalog())).isEmpty();
    }

    @Test
    void legacyNodeRetainsStaticOptionsAndConnectionReferenceMustBeText() {
        assertThat(WorkflowNodeConfigValidator.validate(node(Map.of("prompt", "sample", "sampler", "service-custom-sampler")),
                catalog.catalog())).anyMatch(message -> message.contains("sampler"));
        assertThat(WorkflowNodeConfigValidator.validate(node(Map.of("prompt", "sample", "connectionId", 123)),
                catalog.catalog())).anyMatch(message -> message.contains("connectionId") && message.contains("STRING"));
    }

    private static WorkflowNodeDTO node(Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId("image");
        node.setNodeType("IMAGE_GENERATION");
        node.setConfig(config);
        return node;
    }
}
