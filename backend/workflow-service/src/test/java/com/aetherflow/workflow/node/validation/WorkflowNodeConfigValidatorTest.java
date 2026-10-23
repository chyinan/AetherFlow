package com.aetherflow.workflow.node.validation;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// pattern: Functional Core
class WorkflowNodeConfigValidatorTest {

    private final WorkflowNodeCatalogService catalogService = new WorkflowNodeCatalogService();

    @Test
    void rejectsMissingRequiredCatalogField() {
        WorkflowNodeDTO node = node("knowledge", "KNOWLEDGE_RETRIEVAL", Map.of("query", "hello"));

        assertThat(WorkflowNodeConfigValidator.validate(node, catalogService.catalog()))
                .containsExactly(
                        "node knowledge (KNOWLEDGE_RETRIEVAL): config field 'datasetId' is required",
                        "node knowledge (KNOWLEDGE_RETRIEVAL): one of queryText, queryVariable is required");
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

    @Test
    void acceptsBlankOptionalEnumFieldsAsDeploymentDefaults() {
        WorkflowNodeDTO node = node("sd", "IMAGE_GENERATION", Map.of(
                "provider", "SD_WEBUI", "mode", "txt2img", "prompt", "cat",
                "sampler", "", "scheduler", ""));

        assertThat(WorkflowNodeConfigValidator.validate(node, catalogService.catalog()))
                .noneMatch(message -> message.contains("'sampler'") || message.contains("'scheduler'"));
    }

    @Test
    void acceptsLegacyBlankComfyExecutionGraphField() {
        // 旧数据允许空执行图字段，节点目录校验不额外收紧；
        // 明确清空由映射层区分，并在预检与执行图解析处显式报错。
        WorkflowNodeDTO node = node("image", "IMAGE_GENERATION", Map.of(
                "provider", "COMFYUI", "mode", "workflow",
                "workflow", Map.of("1", Map.of("class_type", "KSampler")),
                "workflowJson", ""));

        assertThat(WorkflowNodeConfigValidator.validate(node, catalogService.catalog()))
                .noneMatch(message -> message.contains("workflowJson"));
    }

    @Test
    void stillRejectsNonBlankUnsupportedEnumValues() {
        WorkflowNodeDTO node = node("sd", "IMAGE_GENERATION", Map.of(
                "provider", "SD_WEBUI", "mode", "txt2img", "prompt", "cat",
                "sampler", "NOT_A_SAMPLER"));

        assertThat(WorkflowNodeConfigValidator.validate(node, catalogService.catalog()))
                .anyMatch(message -> message.contains("'sampler' must be one of"));
    }

    @Test
    void acceptsVariableAssignerJsonLiteralsWithoutChangingObjectValidation() {
        List<Object> values = java.util.Arrays.asList(
                "", "text", 0, 3.5D, true, false, Map.of("nested", List.of(1, "two")), List.of(), null);

        for (Object value : values) {
            Map<String, Object> config = new LinkedHashMap<>();
            config.put("variable", "result");
            config.put("valueMode", "LITERAL");
            config.put("valueType", "JSON");
            config.put("value", value);

            assertThat(WorkflowNodeConfigValidator.validate(
                    node("assign", "VARIABLE_ASSIGNER", config), catalogService.catalog()))
                    .as("JSON literal %s", value)
                    .isEmpty();
        }

        assertThat(WorkflowNodeConfigValidator.validate(node("export", "EXPORT", Map.of(
                "format", "JSON", "content", "not-an-object")),
                catalogService.catalog()))
                .anyMatch(message -> message.contains("config field 'content' must be OBJECT"));
    }

    @Test
    void requiresAValidExplicitVariableAssignerModeAndValueType() {
        assertThat(WorkflowNodeConfigValidator.validate(node("assign", "VARIABLE_ASSIGNER", Map.of(
                "variable", "result", "valueMode", "SOURCE_VARIABLE", "valueType", "JSON")), catalogService.catalog()))
                .contains("node assign (VARIABLE_ASSIGNER): sourceVariable is required in SOURCE_VARIABLE mode");

        assertThat(WorkflowNodeConfigValidator.validate(node("assign", "VARIABLE_ASSIGNER", Map.of(
                "variable", "result", "valueMode", "LITERAL", "valueType", "STRING", "value", 5)),
                catalogService.catalog()))
                .contains("node assign (VARIABLE_ASSIGNER): value must match valueType STRING");
    }

    @Test
    void rejectsNonJsonObjectsAsVariableAssignerLiterals() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("variable", "result");
        config.put("valueMode", "LITERAL");
        config.put("valueType", "JSON");
        config.put("value", new Object());

        assertThat(WorkflowNodeConfigValidator.validate(
                node("assign", "VARIABLE_ASSIGNER", config), catalogService.catalog()))
                .anyMatch(message -> message.contains("config field 'value' must be JSON"));
    }

    @Test
    void variableAssignerCatalogDeclaresDynamicJsonOutput() {
        assertThat(catalogService.catalog().stream()
                .filter(item -> "VARIABLE_ASSIGNER".equals(item.type()))
                .findFirst().orElseThrow().outputVariables())
                .singleElement()
                .extracting(variable -> variable.type())
                .isEqualTo("JSON");
    }

    @Test
    void rejectsExecutableNodesWithoutAnExplicitInputContract() {
        assertThat(WorkflowNodeConfigValidator.validate(
                node("media", "FFMPEG", Map.of()), catalogService.catalog()))
                .contains("node media (FFMPEG): one of fileUrl, fileUrlVariable is required");
        assertThat(WorkflowNodeConfigValidator.validate(
                node("code", "CODE", Map.of("language", "python3")), catalogService.catalog()))
                .contains("node code (CODE): config field 'code' is required");
        assertThat(WorkflowNodeConfigValidator.validate(
                node("summary", "SUMMARY", Map.of()), catalogService.catalog()))
                .contains("node summary (SUMMARY): one of text, textVariable is required");
    }

    @Test
    void validatesExplicitVersionedSubworkflowMappings() {
        assertThat(WorkflowNodeConfigValidator.validate(node("call", "SUBWORKFLOW", Map.of(
                "definitionId", 7, "definitionVersion", 2, "inputMappings", Map.of("text", "request.text"),
                "outputMappings", Map.of("answer", "result.items[0]"))), catalogService.catalog())).isEmpty();
        assertThat(WorkflowNodeConfigValidator.validate(node("call", "SUBWORKFLOW", Map.of(
                "definitionId", 7, "definitionVersion", 0, "inputMappings", Map.of(),
                "outputMappings", Map.of())), catalogService.catalog())).isNotEmpty();
    }

    private static WorkflowNodeDTO node(String id, String type, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setConfig(config);
        return node;
    }
}
