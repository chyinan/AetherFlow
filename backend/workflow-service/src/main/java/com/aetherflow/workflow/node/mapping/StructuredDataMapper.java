package com.aetherflow.workflow.node.mapping;

// pattern: Functional Core

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 无代码结构化映射：只解释白名单操作和字段路径，不执行脚本、反射或表达式语言。 */
public final class StructuredDataMapper {
    public static final int MAX_ITEMS = 1000;
    public static final int MAX_FIELDS = 100;
    public static final int MAX_DEPTH = 32;
    public static final int MAX_VALUES = 20000;
    public static final int MAX_TEXT = 100000;
    private static final Pattern PATH = Pattern.compile("(?:[A-Za-z_][A-Za-z0-9_-]*|\\[[0-9]+])(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[[0-9]+])*");
    private static final Pattern TOKEN = Pattern.compile("([A-Za-z_][A-Za-z0-9_-]*)|\\[([0-9]+)]");
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([^{}]+?)\\s*}}");
    private static final Set<String> FORBIDDEN = Set.of("__proto__", "prototype", "constructor");

    private StructuredDataMapper() { }

    /** 供显式输入/输出绑定复用；返回有界 JSON 深拷贝，不暴露源对象引用。 */
    public static Object readPath(Object root, String fieldPath) {
        return checkedCopy(resolve(root, fieldPath, false, -1));
    }

    public static void validatePath(String fieldPath) { path(fieldPath, false); }

    public static void validate(Object specification) {
        Map<String, Object> spec = object(specification, "mapping");
        checkedCopy(spec);
        String operation = option(spec, "operation", "map", Set.of("select", "object", "map", "filter"));
        path(text(spec, "sourcePath", "$"), false);
        option(spec, "missingPolicy", "error", Set.of("error", "null"));
        if (operation.equals("object") || operation.equals("map")) {
            String shape = operation.equals("object") ? "object" : option(spec, "shape", "object", Set.of("object", "value"));
            if (shape.equals("value")) {
                validateValue(object(spec.get("value"), "value"));
            } else {
                List<?> fields = array(spec.get("fields"), "fields");
                require(!fields.isEmpty() && fields.size() <= MAX_FIELDS, "fields 必须包含 1–100 个字段");
                List<String> targets = new ArrayList<>();
                for (Object entry : fields) {
                    Map<String, Object> field = object(entry, "field");
                    String target = text(field, "target", "");
                    path(target, true);
                    for (String previous : targets) {
                        require(!target.equals(previous) && !target.startsWith(previous + ".") && !previous.startsWith(target + "."),
                                "目标字段重复或互相覆盖: " + target);
                    }
                    targets.add(target);
                    validateValue(field);
                }
            }
        }
        if (spec.containsKey("filter")) {
            Map<String, Object> filter = object(spec.get("filter"), "filter");
            if (filter.containsKey("enabled")) require(filter.get("enabled") instanceof Boolean, "filter.enabled 必须是布尔值");
            if (Boolean.TRUE.equals(filter.get("enabled"))) {
                require(operation.equals("map") || operation.equals("filter"), "筛选条件只适用于数组操作");
                path(text(filter, "path", "$"), false);
                String operator = option(filter, "operator", "notEmpty", Set.of("notEmpty", "empty", "equals", "notEquals", "contains", "gt", "gte", "lt", "lte"));
                if (Set.of("gt", "gte", "lt", "lte").contains(operator)) numeric(filter.get("value"));
                if (operator.equals("contains")) require(filter.get("value") instanceof String, "contains 比较值必须是字符串");
                checkedCopy(filter.get("value"));
            }
        }
        if (operation.equals("filter")) {
            require(spec.get("filter") instanceof Map<?, ?> filter && Boolean.TRUE.equals(filter.get("enabled")), "filter 操作需要启用筛选条件");
        }
    }

    public static Object transform(Map<String, Object> variables, Object specification) {
        validate(specification);
        Map<String, Object> spec = object(specification, "mapping");
        boolean nullable = "null".equals(text(spec, "missingPolicy", "error"));
        Object source = resolve(variables, text(spec, "sourcePath", "$"), nullable, -1);
        String operation = text(spec, "operation", "map");
        Object result;
        if (operation.equals("select")) {
            result = source;
        } else if (operation.equals("object")) {
            result = project(source, spec, nullable, -1);
        } else {
            List<?> input = array(source, "sourcePath 对应的输入");
            require(input.size() <= MAX_ITEMS, "输入数组最多支持 1000 项，请先分批");
            List<Object> output = new ArrayList<>();
            // 同一输出预算覆盖全部数组项，防止许多合法小映射合并后超过限制。
            Budget budget = new Budget();
            for (int index = 0; index < input.size(); index++) {
                Object item = input.get(index);
                if (!matches(item, spec.get("filter"), index)) continue;
                Object mapped = operation.equals("filter") ? item : project(item, spec, nullable, index);
                output.add(copy(mapped, 1, budget));
            }
            result = output;
        }
        require(result != null, "顶层映射结果不能为 null；请使用对象构造承载可空字段");
        return checkedCopy(result);
    }

    private static Object project(Object source, Map<String, Object> spec, boolean nullable, int index) {
        if ("map".equals(text(spec, "operation", "map")) && "value".equals(text(spec, "shape", "object"))) {
            return value(source, object(spec.get("value"), "value"), nullable, index);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Object entry : array(spec.get("fields"), "fields")) {
            Map<String, Object> field = object(entry, "field");
            put(result, text(field, "target", ""), value(source, field, nullable, index));
        }
        return result;
    }

    private static void validateValue(Map<String, Object> value) {
        String type = option(value, "type", "path", Set.of("path", "literal", "template"));
        if (type.equals("literal")) {
            require(value.containsKey("value"), "固定值必须提供 value，可显式填写 null");
            checkedCopy(value.get("value"));
            return;
        }
        require(value.get("value") instanceof String, "路径或模板必须是字符串");
        String source = (String) value.get("value");
        require(source.length() <= MAX_TEXT, "文本超过 100000 字符限制");
        if (type.equals("path")) {
            if (!source.trim().equals("$index")) path(source, false);
        } else {
            Matcher matcher = PLACEHOLDER.matcher(source);
            while (matcher.find()) {
                if (!matcher.group(1).trim().equals("$index")) path(matcher.group(1), false);
            }
            require(!PLACEHOLDER.matcher(source).replaceAll("").contains("{{"), "模板占位符必须是 {{ 字段路径 }}");
        }
    }

    private static Object value(Object source, Map<String, Object> field, boolean nullable, int index) {
        return switch (text(field, "type", "path")) {
            case "literal" -> field.get("value");
            case "path" -> resolve(source, (String) field.get("value"), nullable, index);
            case "template" -> render((String) field.get("value"), source, nullable, index);
            default -> throw new IllegalArgumentException("未知映射值类型");
        };
    }

    private static String render(String template, Object source, boolean nullable, int index) {
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder result = new StringBuilder();
        int end = 0;
        while (matcher.find()) {
            result.append(template, end, matcher.start());
            Object value = resolve(source, matcher.group(1), nullable, index);
            require(value == null || value instanceof String || value instanceof Boolean || value instanceof Number,
                    "模板字段只能是标量，请使用字段映射保留对象或数组");
            result.append(value == null ? "" : scalar(value));
            require(result.length() <= MAX_TEXT, "模板结果超过 100000 字符限制");
            end = matcher.end();
        }
        result.append(template, end, template.length());
        require(result.length() <= MAX_TEXT, "模板结果超过 100000 字符限制");
        return result.toString();
    }

    private static String scalar(Object value) {
        if (value instanceof Number number) return new BigDecimal(number.toString()).stripTrailingZeros().toPlainString();
        return String.valueOf(value);
    }

    private static boolean matches(Object item, Object specification, int index) {
        if (!(specification instanceof Map<?, ?> raw) || !Boolean.TRUE.equals(raw.get("enabled"))) return true;
        Map<String, Object> filter = object(raw, "filter");
        Object actual = resolve(item, text(filter, "path", "$"), true, index);
        Object expected = filter.get("value");
        return switch (text(filter, "operator", "notEmpty")) {
            case "notEmpty" -> !empty(actual);
            case "empty" -> empty(actual);
            case "equals" -> equal(actual, expected);
            case "notEquals" -> !equal(actual, expected);
            case "contains" -> actual instanceof String text && text.contains((String) expected);
            case "gt", "gte", "lt", "lte" -> {
                if (!(actual instanceof Number)) yield false;
                int compared = numeric(actual).compareTo(numeric(expected));
                yield switch (text(filter, "operator", "notEmpty")) {
                    case "gt" -> compared > 0;
                    case "gte" -> compared >= 0;
                    case "lt" -> compared < 0;
                    default -> compared <= 0;
                };
            }
            default -> throw new IllegalArgumentException("未知筛选操作");
        };
    }

    private static boolean equal(Object left, Object right) {
        if (left instanceof Number && right instanceof Number) return numeric(left).compareTo(numeric(right)) == 0;
        if (left instanceof List<?> a && right instanceof List<?> b) {
            if (a.size() != b.size()) return false;
            for (int i = 0; i < a.size(); i++) if (!equal(a.get(i), b.get(i))) return false;
            return true;
        }
        if (left instanceof Map<?, ?> a && right instanceof Map<?, ?> b) {
            if (!a.keySet().equals(b.keySet())) return false;
            for (Object key : a.keySet()) if (!equal(a.get(key), b.get(key))) return false;
            return true;
        }
        return Objects.equals(left, right);
    }

    private static boolean empty(Object value) {
        return value == null || value instanceof String text && text.trim().isEmpty()
                || value instanceof List<?> list && list.isEmpty() || value instanceof Map<?, ?> map && map.isEmpty();
    }

    private static BigDecimal numeric(Object value) {
        require(value instanceof Number, "数值比较只接受 JSON 数字");
        try { return new BigDecimal(value.toString()); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("数值必须是有限数字"); }
    }

    private static Object resolve(Object root, String rawPath, boolean nullable, int index) {
        String fieldPath = rawPath.trim();
        if (fieldPath.equals("$index")) {
            require(index >= 0, "$index 只能用于数组映射");
            return index;
        }
        Object current = root;
        for (String token : path(fieldPath, false)) {
            if (token.startsWith("[")) {
                int itemIndex;
                try { itemIndex = Integer.parseInt(token.substring(1, token.length() - 1)); }
                catch (NumberFormatException exception) { itemIndex = -1; }
                if (current instanceof List<?> list && itemIndex >= 0 && itemIndex < list.size()) current = list.get(itemIndex);
                else return missing(fieldPath, nullable);
            } else if (current instanceof Map<?, ?> map && map.containsKey(token)) current = map.get(token);
            else return missing(fieldPath, nullable);
        }
        return current;
    }

    private static Object missing(String path, boolean nullable) {
        require(nullable, "字段路径不存在: " + path);
        return null;
    }

    private static List<String> path(String raw, boolean target) {
        require(raw != null, "字段路径不能为空");
        String value = raw.trim();
        require(value.length() <= 512, "字段路径过长");
        if (!target && value.equals("$")) return List.of();
        if (!target && value.startsWith("$.")) value = value.substring(2);
        else if (!target && value.startsWith("$[")) value = value.substring(1);
        require(PATH.matcher(value).matches(), "无效字段路径: " + raw);
        require(!target || !value.contains("["), "目标字段仅支持点分隔对象路径");
        List<String> result = new ArrayList<>();
        Matcher matcher = TOKEN.matcher(value);
        while (matcher.find()) {
            String token = matcher.group();
            require(!FORBIDDEN.contains(token), "不允许的字段名: " + token);
            result.add(token);
        }
        require(result.size() <= MAX_DEPTH, "字段路径最多 32 层");
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void put(Map<String, Object> object, String target, Object value) {
        List<String> tokens = path(target, true);
        Map<String, Object> current = object;
        for (int i = 0; i < tokens.size() - 1; i++) {
            current = (Map<String, Object>) current.computeIfAbsent(tokens.get(i), ignored -> new LinkedHashMap<>());
        }
        current.put(tokens.get(tokens.size() - 1), value);
    }

    private static Object checkedCopy(Object value) { return copy(value, 0, new Budget()); }

    private static Object copy(Object value, int depth, Budget budget) {
        require(depth <= MAX_DEPTH && ++budget.values <= MAX_VALUES, "JSON 结果超过深度或元素数量限制");
        if (value == null || value instanceof Boolean) return value;
        if (value instanceof String text) { require(text.length() <= MAX_TEXT, "文本超过 100000 字符限制"); budget.addText(text.length()); return text; }
        if (value instanceof Number) { numeric(value); return value; }
        if (value instanceof List<?> list) {
            require(list.size() <= MAX_ITEMS, "数组最多支持 1000 项");
            List<Object> result = new ArrayList<>();
            for (Object item : list) result.add(copy(item, depth + 1, budget));
            return result;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                require(entry.getKey() instanceof String key && !FORBIDDEN.contains(key), "JSON 对象包含无效字段名");
                String key = (String) entry.getKey();
                budget.addText(key.length());
                result.put(key, copy(entry.getValue(), depth + 1, budget));
            }
            return result;
        }
        throw new IllegalArgumentException("映射只支持 JSON 值");
    }

    private static final class Budget {
        private int values;
        private long text;
        void addText(int size) { text += size; require(text <= 1000000, "JSON 结果超过 100 万字符总量限制"); }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(Object value, String name) {
        require(value instanceof Map<?, ?>, name + " 必须是 JSON 对象");
        return (Map<String, Object>) value;
    }
    private static List<?> array(Object value, String name) { require(value instanceof List<?>, name + " 必须是数组"); return (List<?>) value; }
    private static String text(Map<String, Object> source, String key, String fallback) {
        if (!source.containsKey(key)) return fallback;
        require(source.get(key) instanceof String, key + " 必须是字符串");
        return ((String) source.get(key)).trim();
    }
    private static String option(Map<String, Object> spec, String key, String fallback, Set<String> choices) {
        String value = text(spec, key, fallback); require(choices.contains(value), "无效 " + key + ": " + value); return value;
    }
    private static void require(boolean condition, String message) { if (!condition) throw new IllegalArgumentException(message); }
}
