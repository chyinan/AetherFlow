package com.aetherflow.workflow.node.custom;

import org.junit.jupiter.api.Test;
import java.util.*;
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
}
