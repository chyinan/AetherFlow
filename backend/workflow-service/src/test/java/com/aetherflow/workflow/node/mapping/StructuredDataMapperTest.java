package com.aetherflow.workflow.node.mapping;

// pattern: Functional Core

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StructuredDataMapperTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @TestFactory
    Stream<DynamicTest> sharedFrontendBackendContract() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/structured-mapping-cases.json")) {
            List<Map<String, Object>> cases = JSON.readValue(input, new TypeReference<>() { });
            return cases.stream().map(fixture -> DynamicTest.dynamicTest((String) fixture.get("name"), () -> {
                @SuppressWarnings("unchecked") Map<String, Object> variables = (Map<String, Object>) fixture.get("input");
                Object result = StructuredDataMapper.transform(variables, fixture.get("config"));
                JsonNode actual = JSON.valueToTree(result);
                JsonNode expected = JSON.valueToTree(fixture.get("expected"));
                assertThat(actual).isEqualTo(expected);
            }));
        }
    }

    @Test
    void rejectsMissingPathsAndWrongArrayTypes() {
        assertThatThrownBy(() -> StructuredDataMapper.transform(Map.of(), select("data.missing")))
                .hasMessageContaining("字段路径不存在");
        assertThatThrownBy(() -> StructuredDataMapper.transform(Map.of("items", "abc"), map()))
                .hasMessageContaining("必须是数组");
    }

    @Test
    void rejectsInvalidPathsAndConflictingTargets() {
        for (String path : List.of("items[*]", "items[-1]", "items.filter(x)", "constructor", "$.a.__proto__", "")) {
            assertThatThrownBy(() -> StructuredDataMapper.validate(select(path))).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> StructuredDataMapper.validate(Map.of("operation", "object", "fields", List.of(
                field("a", "x"), field("a.b", "y")))))
                .hasMessageContaining("互相覆盖");
        assertThatThrownBy(() -> StructuredDataMapper.validate(Map.of("operation", "object", "fields", List.of(
                field("a", "x"), field(" a ", "y")))))
                .hasMessageContaining("重复");
    }

    @Test
    void rejectsUnknownOperationsMalformedFiltersAndCodeLikeTemplates() {
        assertThatThrownBy(() -> StructuredDataMapper.validate(Map.of("operation", "execute"))).hasMessageContaining("operation");
        assertThatThrownBy(() -> StructuredDataMapper.validate(Map.of("operation", "filter"))).hasMessageContaining("需要启用筛选");
        assertThatThrownBy(() -> StructuredDataMapper.validate(Map.of("operation", "map", "shape", "value", "value", Map.of("type", "template", "value", "{{ text.toUpperCase() }}"))))
                .hasMessageContaining("无效字段路径");
        assertThatThrownBy(() -> StructuredDataMapper.validate(Map.of("operation", "filter", "filter", Map.of("enabled", true, "operator", "gt", "value", "2"))))
                .hasMessageContaining("JSON 数字");
    }

    @Test
    void enforcesArrayAndFieldLimits() {
        assertThatThrownBy(() -> StructuredDataMapper.transform(Map.of("items", Collections.nCopies(1001, "a")), map()))
                .hasMessageContaining("1000");
        List<Map<String, Object>> fields = new ArrayList<>();
        for (int i = 0; i < 101; i++) fields.add(field("f" + i, "$"));
        assertThatThrownBy(() -> StructuredDataMapper.validate(Map.of("operation", "object", "fields", fields)))
                .hasMessageContaining("100");
    }

    @Test
    void enforcesTotalOutputAndTextLimitsAcrossItems() {
        Map<String, Object> mapping = new LinkedHashMap<>(map());
        mapping.put("value", Map.of("type", "literal", "value", "a".repeat(100000)));
        assertThatThrownBy(() -> StructuredDataMapper.transform(Map.of("items", Collections.nCopies(11, "a")), mapping))
                .hasMessageContaining("100 万字符");
        mapping.put("value", Map.of("type", "template", "value", "{{ $ }}{{ $ }}"));
        assertThatThrownBy(() -> StructuredDataMapper.transform(Map.of("items", List.of("a".repeat(60000))), mapping))
                .hasMessageContaining("100000");
    }

    @Test
    void selectedValuesAndLiteralsAreIndependentCopies() {
        List<Object> source = new ArrayList<>(List.of(new LinkedHashMap<>(Map.of("a", 1))));
        @SuppressWarnings("unchecked") List<Map<String, Object>> result = (List<Map<String, Object>>) StructuredDataMapper.readPath(Map.of("items", source), "items");
        result.get(0).put("a", 2);
        assertThat(source).containsExactly(Map.of("a", 1));
        Map<String, Object> input = new LinkedHashMap<>(); input.put("a", null);
        assertThat(StructuredDataMapper.readPath(input, "a")).isNull();
        assertThatThrownBy(() -> StructuredDataMapper.transform(input, select("a"))).hasMessageContaining("顶层映射结果不能为 null");
    }

    @Test
    void doesNotCoerceObjectsIntoTemplateStrings() {
        Map<String, Object> mapping = new LinkedHashMap<>(map());
        mapping.put("value", Map.of("type", "template", "value", "{{ $ }}"));
        assertThatThrownBy(() -> StructuredDataMapper.transform(Map.of("items", List.of(Map.of("a", 1))), mapping))
                .hasMessageContaining("模板字段只能是标量");
    }

    private static Map<String, Object> select(String path) { return Map.of("operation", "select", "sourcePath", path); }
    private static Map<String, Object> map() { return Map.of("operation", "map", "sourcePath", "items", "shape", "value", "value", Map.of("type", "path", "value", "$")); }
    private static Map<String, Object> field(String target, String source) { return Map.of("target", target, "type", "path", "value", source); }
}
