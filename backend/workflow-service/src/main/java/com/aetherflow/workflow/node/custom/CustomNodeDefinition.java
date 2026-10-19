package com.aetherflow.workflow.node.custom;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

/** 自定义节点的版本化快照；只解释声明和占位符，不执行表达式或用户程序。 */
public final class CustomNodeDefinition {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern TOKEN = Pattern.compile("\\{\\{(inputs|config)\\.([A-Za-z_][A-Za-z0-9_]*)}}");
    private static final Set<String> TYPES = Set.of("STRING", "NUMBER", "BOOLEAN", "OBJECT", "ARRAY");
    public record Field(String name, String type, boolean required, Object defaultValue, List<String> options, String path) {}
    public record Prepared(CustomNodeDefinition definition, Map<String, Object> inputs, Map<String, Object> values) {}
    private final Map<String, Object> source;
    public final String id, version, kind;
    public final List<Field> inputs, fields, outputs;

    private CustomNodeDefinition(Map<String, Object> source) {
        this.source = source;
        require(Objects.equals(source.get("formatVersion"), 1), "不支持的自定义节点格式版本");
        id = text(source.get("id")); version = text(source.get("version")); kind = text(source.get("kind"));
        require(id.matches("[a-z][a-z0-9-]{2,63}"), "模板 ID 必须为 3 至 64 位小写字母、数字和短横线");
        require(version.matches("[0-9]+\\.[0-9]+\\.[0-9]+"), "模板版本必须为 x.y.z");
        require(!text(source.get("name")).isBlank() && text(source.get("name")).length() <= 100, "模板名称必填且不能超过 100 字符");
        require(Set.of("API", "CODE").contains(kind), "模板类型必须为 API 或 CODE");
        inputs = parseFields(source.get("inputs"), false); fields = parseFields(source.get("fields"), false);
        outputs = parseFields(source.get("outputs"), true);
        require(!outputs.isEmpty(), "至少声明一个输出");
        if (kind.equals("API")) {
            Map<String, Object> request = object(source.get("request"), "HTTP 调用规则");
            require(text(request.get("url")).matches("https?://.+"), "HTTP URL 必须以 http:// 或 https:// 开头");
            require(Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD").contains(text(request.get("method"))), "HTTP 方法无效");
            require(!Set.of("GET", "HEAD").contains(request.get("method")) || !request.containsKey("body"), "GET/HEAD 不能配置请求体");
            Map<String, Object> headers = object(request.getOrDefault("headers", Map.of()), "HTTP 请求头");
            require(headers.size() <= 24, "请求头数量不能超过 24");
            headers.forEach((name, value) -> {
                require(name.matches("[A-Za-z][A-Za-z0-9-]{0,63}") && value instanceof String, "请求头名称或值无效");
                require(!Set.of("host", "content-length", "connection", "upgrade", "expect", "transfer-encoding").contains(name.toLowerCase(Locale.ROOT))
                        && !name.toLowerCase(Locale.ROOT).startsWith("proxy-"), "请求头不允许覆盖传输控制字段");
            });
            validateTokens(request, 0);
        } else {
            String code = text(source.get("code"));
            require(!code.isBlank() && code.length() <= 32768, "Python 程序必填且不能超过 32768 字符");
        }
    }

    public static CustomNodeDefinition from(Object value) {
        try {
            require(JSON.writeValueAsBytes(value).length <= 65536, "模板不能超过 64 KiB");
            return new CustomNodeDefinition(object(value, "模板定义"));
        } catch (IllegalArgumentException exception) { throw exception; }
        catch (Exception exception) { throw new IllegalArgumentException("模板必须是有效 JSON 对象"); }
    }

    public static CustomNodeDefinition validateConfig(String nodeType, Map<String, Object> config) {
        CustomNodeDefinition definition = from(config.get("customDefinition"));
        require((definition.kind.equals("API") ? "HTTP_REQUEST" : "CODE").equalsIgnoreCase(nodeType), "模板类型与工作流节点类型不一致");
        definition.bind(definition.fields, config.get("customValues"), Map.of(), Map.of(), true);
        definition.bind(definition.inputs, config.get("customInputs"), object(config.getOrDefault("inputBindings", Map.of()), "输入绑定"), Map.of(), false);
        return definition;
    }

    public static Prepared prepare(String nodeType, Map<String, Object> config, Map<String, Object> variables) {
        CustomNodeDefinition definition = validateConfig(nodeType, config);
        Map<String, Object> inputs = definition.bind(definition.inputs, config.get("customInputs"),
                object(config.getOrDefault("inputBindings", Map.of()), "输入绑定"), variables, true);
        return new Prepared(definition, inputs, definition.bind(definition.fields, config.get("customValues"), Map.of(), Map.of(), true));
    }

    public String code() { return text(source.get("code")); }
    public Map<String, Object> request() { return object(source.get("request"), "HTTP 调用规则"); }
    public Object resolve(Object value, Prepared prepared, boolean url) { return resolveValue(value, prepared, url, 0); }

    public Map<String, Object> mapOutputs(Object result) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (Field output : outputs) {
            var node = JSON.valueToTree(result).at(output.path());
            Object value = node.isMissingNode() || node.isNull() ? null : JSON.convertValue(node, Object.class);
            check(output, value);
            if (value != null) values.put(output.name(), value);
        }
        return values;
    }

    private Map<String, Object> bind(List<Field> schema, Object raw, Map<String, Object> bindings, Map<String, Object> variables, boolean runtime) {
        Map<String, Object> configured = raw == null ? Map.of() : object(raw, "节点参数");
        Set<String> names = new HashSet<>(); schema.forEach(field -> names.add(field.name()));
        require(names.containsAll(configured.keySet()) && names.containsAll(bindings.keySet()), "节点参数包含未声明字段");
        require(bindings.values().stream().allMatch(value -> value instanceof String), "输入绑定必须为变量名字符串");
        Map<String, Object> values = new LinkedHashMap<>();
        for (Field field : schema) {
            String variable = text(bindings.get(field.name()));
            require(variable.isEmpty() || variable.matches("[A-Za-z_][A-Za-z0-9_]*"), "输入变量名无效：" + field.name());
            if (!variable.isEmpty() && !runtime) continue;
            if (!variable.isEmpty()) require(variables.containsKey(variable), "输入变量不存在：" + variable);
            Object value = variable.isEmpty() ? configured.getOrDefault(field.name(), field.defaultValue()) : variables.get(variable);
            check(field, value);
            if (value != null) values.put(field.name(), value);
        }
        return values;
    }

    private static List<Field> parseFields(Object raw, boolean output) {
        require(raw instanceof List<?> && ((List<?>) raw).size() <= 32, "输入、输出和表单必须为最多 32 项的数组");
        List<Field> result = new ArrayList<>(); Set<String> names = new HashSet<>();
        for (Object entry : (List<?>) raw) {
            Map<String, Object> field = object(entry, "字段");
            String name = text(field.get("name")), type = text(field.get("type"));
            require(name.matches("[A-Za-z_][A-Za-z0-9_]{0,63}") && !Set.of("__proto__", "constructor", "prototype").contains(name) && names.add(name), "字段名称无效或重复：" + name);
            require(TYPES.contains(type), "字段类型无效：" + name);
            require(!field.containsKey("required") || field.get("required") instanceof Boolean, "required 必须为布尔值");
            List<String> options = new ArrayList<>();
            if (field.containsKey("options")) {
                require(type.equals("STRING") && field.get("options") instanceof List<?> && ((List<?>) field.get("options")).size() <= 64, "选项只支持字符串字段，最多 64 项");
                for (Object option : (List<?>) field.get("options")) { require(option instanceof String, "选项必须为字符串"); options.add((String) option); }
            }
            String path = text(field.getOrDefault("path", "/" + name));
            require(!output || path.isEmpty() || path.matches("(?:/(?:[^~/]|~[01])*)+"), "输出路径必须为 JSON Pointer");
            Field parsed = new Field(name, type, Boolean.TRUE.equals(field.get("required")), field.get("defaultValue"), List.copyOf(options), path);
            if (parsed.defaultValue() != null) check(parsed, parsed.defaultValue());
            result.add(parsed);
        }
        return List.copyOf(result);
    }

    private static void check(Field field, Object value) {
        require(value != null || !field.required(), "字段必填：" + field.name());
        if (value == null) return;
        boolean valid = switch (field.type()) {
            case "STRING" -> value instanceof String && (!field.required() || !((String) value).isBlank());
            case "NUMBER" -> value instanceof Number && Double.isFinite(((Number) value).doubleValue());
            case "BOOLEAN" -> value instanceof Boolean;
            case "OBJECT" -> value instanceof Map<?, ?>;
            case "ARRAY" -> value instanceof List<?>;
            default -> false;
        };
        require(valid, "字段类型不符合 " + field.type() + "：" + field.name());
        require(field.options().isEmpty() || field.options().contains(value), "字段不在允许选项中：" + field.name());
    }

    private void validateTokens(Object value, int depth) {
        require(depth <= 16, "请求体嵌套不能超过 16 层");
        if (value instanceof Map<?, ?> map) { map.values().forEach(item -> validateTokens(item, depth + 1)); return; }
        if (value instanceof List<?> list) { list.forEach(item -> validateTokens(item, depth + 1)); return; }
        if (!(value instanceof String text)) return;
        var matcher = TOKEN.matcher(text);
        while (matcher.find()) {
            List<Field> declared = matcher.group(1).equals("inputs") ? inputs : fields;
            String name = matcher.group(2);
            require(declared.stream().anyMatch(field -> field.name().equals(name)), "占位符引用未声明字段：" + name);
        }
        require(!TOKEN.matcher(text).replaceAll("").contains("{{"), "占位符仅支持 {{inputs.字段}} 和 {{config.字段}}");
    }

    private Object resolveValue(Object value, Prepared prepared, boolean url, int depth) {
        require(depth <= 16, "请求体嵌套不能超过 16 层");
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> resolved = new LinkedHashMap<>();
            map.forEach((key, item) -> resolved.put(String.valueOf(key), resolveValue(item, prepared, url, depth + 1))); return resolved;
        }
        if (value instanceof List<?> list) return list.stream().map(item -> resolveValue(item, prepared, url, depth + 1)).toList();
        if (!(value instanceof String text)) return value;
        var matcher = TOKEN.matcher(text); StringBuilder resolved = new StringBuilder();
        while (matcher.find()) {
            Map<String, Object> values = matcher.group(1).equals("inputs") ? prepared.inputs() : prepared.values();
            require(values.containsKey(matcher.group(2)), "占位符没有值：" + matcher.group(2));
            Object replacement = values.get(matcher.group(2));
            if (!url && matcher.start() == 0 && matcher.end() == text.length()) return replacement;
            require(!(replacement instanceof Map<?, ?> || replacement instanceof List<?>), "文本占位符必须是标量");
            String rendered = String.valueOf(replacement);
            matcher.appendReplacement(resolved, java.util.regex.Matcher.quoteReplacement(url ? URLEncoder.encode(rendered, StandardCharsets.UTF_8).replace("+", "%20") : rendered));
        }
        matcher.appendTail(resolved); return resolved.toString();
    }

    @SuppressWarnings("unchecked") public static Map<String, Object> object(Object raw, String label) {
        require(raw instanceof Map<?, ?>, label + "必须为对象"); return (Map<String, Object>) raw;
    }
    private static String text(Object raw) { return raw instanceof String text ? text : ""; }
    private static void require(boolean valid, String message) { if (!valid) throw new IllegalArgumentException(message); }
}
