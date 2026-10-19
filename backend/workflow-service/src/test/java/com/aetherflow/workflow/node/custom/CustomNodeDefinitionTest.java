package com.aetherflow.workflow.node.custom;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;

class CustomNodeDefinitionTest {
    static Map<String, Object> definition(String kind) {
        Map<String, Object> value = new LinkedHashMap<>(Map.of("formatVersion", 1, "id", "test-custom", "version", "1.0.0", "name", "测试节点", "kind", kind,
                "inputs", List.of(Map.of("name", "text", "type", "STRING", "required", true)),
                "fields", List.of(Map.of("name", "limit", "type", "NUMBER", "defaultValue", 3)),
                "outputs", List.of(Map.of("name", "customResult", "type", "NUMBER", "required", true, "path", "/nested/a~1b"))));
        if (kind.equals("API")) value.put("request", Map.of("url", "https://example.com/{{inputs.text}}", "method", "POST", "headers", Map.of("X-Limit", "{{config.limit}}"), "body", Map.of("limit", "{{config.limit}}")));
        else value.put("code", "def main(payload): return {'nested': {'a/b': payload['config']['limit']}}");
        return value;
    }
    @Test void validatesBindingAndPreservesTypedRequestValues() {
        var config = Map.<String, Object>of("customDefinition", definition("API"), "inputBindings", Map.of("text", "query"));
        assertThatCode(() -> CustomNodeDefinition.validateConfig("HTTP_REQUEST", config)).doesNotThrowAnyException();
        var prepared = CustomNodeDefinition.prepare("HTTP_REQUEST", config, Map.of("query", "a/b x"));
        assertThat(prepared.definition().resolve(prepared.definition().request().get("url"), prepared, true)).isEqualTo("https://example.com/a%2Fb%20x");
        assertThat(prepared.definition().resolve(prepared.definition().request().get("body"), prepared, false)).isEqualTo(Map.of("limit", 3));
        assertThat(prepared.definition().mapOutputs(Map.of("nested", Map.of("a/b", 9)))).isEqualTo(Map.of("customResult", 9));
        assertThatThrownBy(() -> CustomNodeDefinition.prepare("HTTP_REQUEST", config, Map.of())).hasMessageContaining("输入变量不存在");
    }
    @Test void rejectsVersionMismatchInvalidTypesAndUnknownTokens() {
        var unknownVersion = definition("API"); unknownVersion.put("formatVersion", 2);
        assertThatThrownBy(() -> CustomNodeDefinition.from(unknownVersion)).hasMessageContaining("格式版本");
        assertThatThrownBy(() -> CustomNodeDefinition.validateConfig("CODE", Map.of("customDefinition", definition("API")))).hasMessageContaining("类型不一致");
        var unknownToken = definition("API"); unknownToken.put("request", Map.of("method", "GET", "url", "https://example.com/{{config.missing}}"));
        assertThatThrownBy(() -> CustomNodeDefinition.from(unknownToken)).hasMessageContaining("未声明");
        var definition = CustomNodeDefinition.from(definition("CODE"));
        assertThatThrownBy(() -> definition.mapOutputs(Map.of("nested", Map.of("a/b", "wrong")))).hasMessageContaining("NUMBER");
        assertThatThrownBy(() -> definition.mapOutputs(Map.of())).hasMessageContaining("必填");
        assertThatThrownBy(() -> CustomNodeDefinition.prepare("CODE", Map.of("customDefinition", definition("CODE"), "customInputs", Map.of("text", 9)), Map.of())).hasMessageContaining("STRING");
    }
    @Test void checksEnumsDuplicateNamesAndForbiddenHeaders() {
        var duplicate = definition("CODE"); duplicate.put("inputs", List.of(Map.of("name", "x", "type", "STRING"), Map.of("name", "x", "type", "STRING")));
        assertThatThrownBy(() -> CustomNodeDefinition.from(duplicate)).hasMessageContaining("重复");
        var header = definition("API"); header.put("request", Map.of("method", "GET", "url", "https://example.com", "headers", Map.of("Host", "other")));
        assertThatThrownBy(() -> CustomNodeDefinition.from(header)).hasMessageContaining("传输控制");
        var enumeration = definition("CODE"); enumeration.put("fields", List.of(Map.of("name", "mode", "type", "STRING", "required", true, "options", List.of("A"))));
        assertThatThrownBy(() -> CustomNodeDefinition.validateConfig("CODE", Map.of("customDefinition", enumeration, "customValues", Map.of("mode", "B"), "inputBindings", Map.of("text", "query")))).hasMessageContaining("允许选项");
    }

    static Stream<Arguments> pointerCases() throws Exception {
        try (var input = Objects.requireNonNull(CustomNodeDefinitionTest.class.getResourceAsStream("/custom-node-pointer-cases.json"))) {
            List<Map<String, Object>> examples = new ObjectMapper().readValue(input, new TypeReference<>() {});
            return examples.stream().map(example -> Arguments.of(example.get("name"), example));
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("pointerCases")
    void pointerContractMatchesFrontend(String name, Map<String, Object> example) {
        for (boolean required : new boolean[]{true, false}) {
            var source = definition("CODE");
            source.put("outputs", List.of(Map.of("name", "mapped", "type", example.get("type"), "path", example.get("path"), "required", required)));
            if (Boolean.TRUE.equals(example.get("invalidPointer"))) {
                assertThatThrownBy(() -> CustomNodeDefinition.from(source)).hasMessageContaining("JSON Pointer");
                continue;
            }
            var parsed = CustomNodeDefinition.from(source);
            if (Boolean.TRUE.equals(example.get("missing")) && required) {
                assertThatThrownBy(() -> parsed.mapOutputs(example.get("sample"))).hasMessageContaining("字段必填");
            } else {
                var expected = Boolean.TRUE.equals(example.get("missing")) ? Map.of() : Map.of("mapped", example.get("expected"));
                assertThat(parsed.mapOutputs(example.get("sample"))).as(name).isEqualTo(expected);
            }
        }
    }

    static Stream<Arguments> convertedFields() {
        return Stream.of("inputs", "fields", "outputs").flatMap(group -> Stream.of("NUMBER", "BOOLEAN", "OBJECT", "ARRAY").map(type -> Arguments.of(group, type)));
    }

    @ParameterizedTest(name = "{0}: STRING -> {1}")
    @MethodSource("convertedFields")
    void nonStringFieldsWithoutOptionsSurviveJsonSaveContract(String group, String type) throws Exception {
        var source = definition("CODE");
        var field = new LinkedHashMap<String, Object>(Map.of("name", "converted", "type", type, "required", false));
        if (group.equals("outputs")) field.put("path", "/value");
        source.put(group, List.of(field));
        var json = new ObjectMapper();
        var roundtrip = json.readValue(json.writeValueAsBytes(source), new TypeReference<Map<String, Object>>() {});
        assertThatCode(() -> CustomNodeDefinition.from(roundtrip)).doesNotThrowAnyException();
        Object value = switch (type) {
            case "NUMBER" -> 7;
            case "BOOLEAN" -> false;
            case "OBJECT" -> Map.of("nested", true);
            default -> List.of(1, 2);
        };
        if (group.equals("outputs")) {
            assertThat(CustomNodeDefinition.from(roundtrip).mapOutputs(Map.of("value", value))).isEqualTo(Map.of("converted", value));
        } else {
            Map<String, Object> config = Map.of("customDefinition", roundtrip, "customInputs", group.equals("inputs") ? Map.of("converted", value) : Map.of("text", "demo"),
                    "customValues", group.equals("fields") ? Map.of("converted", value) : Map.of());
            var prepared = CustomNodeDefinition.prepare("CODE", config, Map.of());
            assertThat(group.equals("inputs") ? prepared.inputs() : prepared.values()).containsEntry("converted", value);
        }
        // 导入旧的非字符串 options（即使为空）仍明确拒绝，不放宽服务端契约。
        field.put("options", List.of());
        assertThatThrownBy(() -> CustomNodeDefinition.from(source)).hasMessageContaining("选项只支持字符串字段");
    }
}
