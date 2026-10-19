package com.aetherflow.ai.copilot.service;

import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CopilotCustomNodeDraftsTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Map<String, Object> SUPPORTED = Map.of("capabilities", Map.of("customNodeDrafts", true));

    @Test
    void apiDraftAndExactReferenceRetainLibraryDefinitionWithoutInstanceValues() throws Exception {
        ObjectNode draft = draft("API");
        var result = parse(draft, JSON.readTree("""
                {"type":"add_node","nodeId":"api-1","kind":"http-request","customNodeId":"my-template","customNodeVersion":"1.0.0"}
                """));
        assertThat(result.operations()).hasSize(2);
        assertThat(result.operations().get(0).draftId()).isEqualTo("draft-1");
        assertThat(result.operations().get(0).definition()).containsEntry("id", "my-template");
        assertThat(result.operations().get(1).customNodeId()).isEqualTo("my-template");
        assertThat(result.operations().get(1).customNodeVersion()).isEqualTo("1.0.0");
        var serialized = JSON.readTree(JSON.writeValueAsString(result));
        assertThat(serialized.path("operations").get(0).size()).isEqualTo(3);
        assertThat(serialized.path("operations").get(0).has("nodeId")).isFalse();
        assertThat(serialized.path("operations").get(0).has("config")).isFalse();
    }

    @Test
    void codeDraftCanBeReturnedAloneWithoutCodeRuntimeCapability() throws Exception {
        var result = parse(draft("CODE"));
        assertThat(result.operations()).hasSize(1);
        assertThat(result.operations().get(0).definition()).containsEntry("kind", "CODE")
                .containsEntry("code", "def main(payload):\n    return {\"result\": payload[\"inputs\"][\"text\"]}\n");
    }

    @Test
    void newActionsAndReferencesRequireStrictClientOptIn() throws Exception {
        String create = envelope(draft("CODE"));
        String reference = """
                {"status":"READY","explanation":"添加模板","operations":[{"type":"add_node","nodeId":"x","kind":"code","customNodeId":"my-template","customNodeVersion":"1.0.0"}]}
                """;
        for (Map<String, Object> context : List.<Map<String, Object>>of(Map.of(),
                Map.of("capabilities", Map.of("customNodeDrafts", false)),
                Map.of("capabilities", Map.of("customNodeDrafts", "true")))) {
            assertThatThrownBy(() -> CopilotCanvasEdits.parse(create, context)).isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> CopilotCanvasEdits.parse(reference, context)).isInstanceOf(BusinessException.class);
        }
        assertThatThrownBy(() -> CopilotCanvasEdits.parse(create)).isInstanceOf(BusinessException.class);
    }

    @Test
    void ordinaryResponsesOmitCustomFields() throws Exception {
        var result = CopilotCanvasEdits.parse("""
                {"status":"READY","explanation":"添加开始节点","operations":[{"type":"add_node","nodeId":"start-1","kind":"start"}]}
                """, SUPPORTED);
        String wire = JSON.writeValueAsString(result);
        assertThat(wire).contains("start-1").doesNotContain("draftId", "definition", "customNodeId", "customNodeVersion");
    }

    @Test
    void rejectsDuplicateDraftOrTemplateIdentitiesBeforeReturningBatch() throws Exception {
        ObjectNode first = draft("CODE");
        ObjectNode second = first.deepCopy();
        definition(second).put("id", "another-template");
        assertThatThrownBy(() -> parse(first, second)).isInstanceOf(BusinessException.class);
        second.put("draftId", "draft-2");
        definition(second).put("id", "my-template");
        assertThatThrownBy(() -> parse(first, second)).isInstanceOf(BusinessException.class);
    }

    @Test
    void rejectsIncompleteReferenceAndInlineDefinitionBypass() throws Exception {
        for (String action : List.of(
                "{\"type\":\"add_node\",\"nodeId\":\"x\",\"kind\":\"code\",\"customNodeId\":\"my-template\"}",
                "{\"type\":\"add_node\",\"nodeId\":\"x\",\"kind\":\"code\",\"customNodeVersion\":\"1.0.0\"}",
                "{\"type\":\"add_node\",\"nodeId\":\"x\",\"kind\":\"llm\",\"customNodeId\":\"my-template\",\"customNodeVersion\":\"1.0.0\"}",
                "{\"type\":\"update_node\",\"nodeId\":\"x\",\"config\":{\"customDefinition\":{}}}",
                "{\"type\":\"add_node\",\"nodeId\":\"x\",\"kind\":\"code\",\"config\":{\"customDefinition\":{}}}")) {
            assertThatThrownBy(() -> parse(JSON.readTree(action))).isInstanceOf(BusinessException.class);
        }
    }

    @Test
    void rejectsUnknownDraftFieldsAndWrongDefinitionShape() throws Exception {
        ObjectNode extra = draft("API");
        extra.put("execute", true);
        assertThatThrownBy(() -> parse(extra)).isInstanceOf(BusinessException.class);
        for (String field : List.of("formatVersion", "id", "version", "name", "description", "inputs", "fields", "outputs", "request")) {
            ObjectNode candidate = draft("API");
            definition(candidate).putNull(field);
            assertThatThrownBy(() -> parse(candidate)).isInstanceOf(BusinessException.class);
        }
        ObjectNode code = draft("CODE");
        definition(code).putObject("request");
        assertThatThrownBy(() -> parse(code)).isInstanceOf(BusinessException.class);
    }

    @Test
    void preservesCodeLimitSeparatelyFromOrdinaryConfigStrings() throws Exception {
        ObjectNode code = draft("CODE");
        definition(code).put("code", "#".repeat(32768));
        assertThat(parse(code).operations().get(0).definition().get("code")).isEqualTo("#".repeat(32768));
        definition(code).put("code", "#".repeat(32769));
        assertThatThrownBy(() -> parse(code)).isInstanceOf(BusinessException.class);
    }

    @Test
    void rejectsDefinitionsOverUtf8LimitEvenWhenEnvelopeCharacterLimitPasses() throws Exception {
        ObjectNode draft = draft("CODE");
        definition(draft).put("description", "中".repeat(22000));
        assertThat(envelope(draft).length()).isLessThan(64000);
        assertThatThrownBy(() -> parse(draft)).isInstanceOf(BusinessException.class);
    }

    @Test
    void promptDescribesConfirmationAndUsesOnlyOptedInCustomCatalog() {
        String supported = CopilotCanvasEdits.prompt(SUPPORTED, "", "生成模板并添加节点");
        assertThat(supported).contains("create_custom_node", "customNodeCatalog", "customNodeId", "customNodeVersion",
                "明确确认", "不执行代码", "同批返回 create_custom_node", "运行能力不可用仍可生成和保存模板草稿");
        assertThat(CopilotCanvasEdits.prompt(Map.of(), "", "生成模板")).doesNotContain("\"type\":\"create_custom_node\"")
                .contains("当前客户端不支持自定义模板草稿");
    }

    private static ObjectNode draft(String kind) throws JsonProcessingException {
        ObjectNode draft = (ObjectNode) JSON.readTree("""
                {"type":"create_custom_node","draftId":"draft-1","definition":{
                  "formatVersion":1,"id":"my-template","version":"1.0.0","name":"自定义模板","description":"仅生成草稿",
                  "kind":"API","inputs":[{"name":"text","type":"STRING","required":true}],"fields":[],
                  "outputs":[{"name":"result","type":"STRING","path":"/result"}],
                  "request":{"url":"https://example.com/api","method":"POST","headers":{},"body":{"text":"{{inputs.text}}"}}
                }}
                """);
        if ("CODE".equals(kind)) {
            definition(draft).put("kind", "CODE").put("code", "def main(payload):\n    return {\"result\": payload[\"inputs\"][\"text\"]}\n");
            definition(draft).remove("request");
        }
        return draft;
    }

    private static ObjectNode definition(ObjectNode draft) { return (ObjectNode) draft.path("definition"); }

    private static String envelope(com.fasterxml.jackson.databind.JsonNode... operations) throws JsonProcessingException {
        return JSON.writeValueAsString(Map.of("status", "READY", "explanation", "待确认的模板草稿", "operations", operations));
    }

    private static CopilotCanvasEdits.Edit parse(com.fasterxml.jackson.databind.JsonNode... operations) throws JsonProcessingException {
        return CopilotCanvasEdits.parse(envelope(operations), SUPPORTED);
    }
}
