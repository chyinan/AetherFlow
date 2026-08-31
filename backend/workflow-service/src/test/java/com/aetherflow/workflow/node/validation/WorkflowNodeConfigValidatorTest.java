package com.aetherflow.workflow.node.validation;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// pattern: Functional Core
class WorkflowNodeConfigValidatorTest {

    private final WorkflowNodeCatalogService catalogService = new WorkflowNodeCatalogService();

    @Test
    void rejectsMissingRequiredCatalogField() {
        WorkflowNodeDTO node = node("knowledge", "KNOWLEDGE_RETRIEVAL", Map.of("query", "hello"));

        assertThat(WorkflowNodeConfigValidator.validate(node, catalogService.catalog()))
                .containsExactly("node knowledge (KNOWLEDGE_RETRIEVAL): config field 'datasetId' is required");
    }

    @Test
    void rejectsWrongTypeAndUnsupportedOption() {
        WorkflowNodeDTO node = node("condition", "CONDITION", Map.of(
                "variable", 123,
                "operator", "not-supported"));

        assertThat(WorkflowNodeConfigValidator.validate(node, catalogService.catalog()))
                .containsExactly(
                        "node condition (CONDITION): config field 'variable' must be STRING",
                        "node condition (CONDITION): config field 'operator' must be one of [EQUALS, NOT_EQUALS, EXISTS, NOT_EXISTS, CONTAINS, GREATER_THAN, LESS_THAN]");
    }

    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setConfig(config);
        return node;
    }
}
