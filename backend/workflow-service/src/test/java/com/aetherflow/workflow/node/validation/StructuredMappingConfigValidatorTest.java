package com.aetherflow.workflow.node.validation;

// pattern: Functional Core

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class StructuredMappingConfigValidatorTest {
    @Test
    void structuredModeDoesNotRequireLegacyTemplateAndAcceptsNestedMapping() {
        assertThat(validate(Map.of("transformMode", "structured", "outputVariable", "promptList", "mapping", Map.of(
                "operation", "map", "sourcePath", "segments", "shape", "value", "value", Map.of("type", "path", "value", "text")))))
                .isEmpty();
    }

    @Test
    void validatesMappingBeforePersistence() {
        assertThat(validate(Map.of("transformMode", "structured"))).anyMatch(message -> message.contains("mapping 必须是 JSON 对象"));
        assertThat(validate(Map.of("transformMode", "structured", "mapping", Map.of("operation", "map", "fields", List.of()))))
                .anyMatch(message -> message.contains("fields 必须包含"));
        assertThat(validate(Map.of("transformMode", "structured", "mapping", Map.of("operation", "select", "sourcePath", "items[*]"))))
                .anyMatch(message -> message.contains("无效字段路径"));
    }

    @Test
    void textModeKeepsExistingRequiredTemplateContract() {
        assertThat(validate(Map.of())).containsExactly("node mapper (TEMPLATE_TRANSFORM): config field 'template' is required");
        assertThat(validate(Map.of("template", "hello {{ name }}"))).isEmpty();
    }

    private static List<String> validate(Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId("mapper"); node.setNodeType("TEMPLATE_TRANSFORM"); node.setConfig(config);
        return WorkflowNodeConfigValidator.validate(node, new WorkflowNodeCatalogService().catalog());
    }
}
