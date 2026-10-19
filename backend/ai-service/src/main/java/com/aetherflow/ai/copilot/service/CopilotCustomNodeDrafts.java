package com.aetherflow.ai.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** 仅校验草稿的传输结构和边界；完整模板及实例校验继续使用客户端与工作流服务。 */
final class CopilotCustomNodeDrafts {
    private static final Set<String> DEFINITION_FIELDS = Set.of("formatVersion", "id", "version", "name",
            "description", "kind", "inputs", "fields", "outputs", "request", "code");
    private static final Set<String> FIELD_FIELDS = Set.of("name", "type", "required", "defaultValue", "options", "path");
    private static final Set<String> FIELD_TYPES = Set.of("STRING", "NUMBER", "BOOLEAN", "OBJECT", "ARRAY");
    private static final Set<String> RESERVED_NAMES = Set.of("__proto__", "constructor", "prototype");
    private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD");

    private CopilotCustomNodeDrafts() { }

    static boolean isIdentity(JsonNode id, JsonNode version) {
        return id.isTextual() && id.asText().matches("[a-z][a-z0-9-]{2,63}")
                && version.isTextual() && version.asText().matches("[0-9]+\\.[0-9]+\\.[0-9]+");
    }

    static boolean isValid(JsonNode definition) {
        if (!onlyFields(definition, DEFINITION_FIELDS) || !definition.path("formatVersion").isIntegralNumber()
                || !definition.path("formatVersion").canConvertToInt() || definition.path("formatVersion").asInt() != 1
                || !isIdentity(definition.path("id"), definition.path("version"))
                || !text(definition.path("name"), 100, true) || !definition.path("description").isTextual()
                || definition.toString().getBytes(StandardCharsets.UTF_8).length > 65536 || !boundedValue(definition, 0)) return false;
        for (String field : new String[]{"inputs", "fields", "outputs"}) {
            if (!fields(definition.path(field), "outputs".equals(field))) return false;
        }
        return switch (definition.path("kind").asText()) {
            case "CODE" -> !definition.has("request") && text(definition.path("code"), 32768, true);
            case "API" -> !definition.has("code") && request(definition.path("request"));
            default -> false;
        };
    }

    private static boolean fields(JsonNode fields, boolean outputs) {
        if (!fields.isArray() || fields.size() > 32 || (outputs && fields.isEmpty())) return false;
        Set<String> names = new HashSet<>();
        for (JsonNode field : fields) {
            String name = field.path("name").asText();
            if (!onlyFields(field, FIELD_FIELDS) || !field.path("name").isTextual()
                    || !name.matches("[A-Za-z_][A-Za-z0-9_]{0,63}") || RESERVED_NAMES.contains(name)
                    || !names.add(name) || !FIELD_TYPES.contains(field.path("type").asText())
                    || (field.has("required") && !field.path("required").isBoolean())
                    || (field.has("path") && (!field.path("path").isTextual()
                        || (outputs && !field.path("path").asText().isEmpty()
                            && !field.path("path").asText().matches("(?:/(?:[^~/]|~[01])*)+"))))) return false;
            if (field.has("options")) {
                JsonNode options = field.path("options");
                if (!"STRING".equals(field.path("type").asText()) || !options.isArray() || options.size() > 64) return false;
                for (JsonNode option : options) if (!option.isTextual()) return false;
            }
        }
        return true;
    }

    private static boolean request(JsonNode request) {
        if (!onlyFields(request, Set.of("url", "method", "headers", "body"))
                || !request.path("url").isTextual() || !request.path("url").asText().matches("https?://.+")
                || !METHODS.contains(request.path("method").asText())
                || (Set.of("GET", "HEAD").contains(request.path("method").asText()) && request.has("body"))
                || !request.path("headers").isObject() || request.path("headers").size() > 24) return false;
        var headers = request.path("headers").fields();
        while (headers.hasNext()) {
            var header = headers.next();
            if (!header.getKey().matches("[A-Za-z][A-Za-z0-9-]{0,63}") || !header.getValue().isTextual()) return false;
        }
        return true;
    }

    private static boolean onlyFields(JsonNode node, Set<String> allowed) {
        if (!node.isObject()) return false;
        var keys = node.fieldNames();
        while (keys.hasNext()) if (!allowed.contains(keys.next())) return false;
        return true;
    }

    private static boolean text(JsonNode value, int limit, boolean required) {
        return value.isTextual() && value.asText().length() <= limit && (!required || !value.asText().isBlank());
    }

    private static boolean boundedValue(JsonNode value, int depth) {
        if (depth > 20 || (value.isContainerNode() && value.size() > 100)
                || (value.isTextual() && (value.asText().length() > 32768 || "[redacted]".equals(value.asText())))
                || (value.isNumber() && !Double.isFinite(value.asDouble()))) return false;
        if (value.isObject()) {
            var entries = value.fields();
            while (entries.hasNext()) {
                var entry = entries.next();
                if (RESERVED_NAMES.contains(entry.getKey()) || !boundedValue(entry.getValue(), depth + 1)) return false;
            }
        } else if (value.isArray()) {
            for (JsonNode item : value) if (!boundedValue(item, depth + 1)) return false;
        }
        return true;
    }
}
