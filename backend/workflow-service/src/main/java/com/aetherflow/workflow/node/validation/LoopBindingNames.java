package com.aetherflow.workflow.node.validation;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 只检查循环容器写入的绑定名称；双下划线前缀留给运行时上下文。 */
public final class LoopBindingNames {
    private LoopBindingNames() { }

    public static List<String> validate(String nodeType, Map<String, Object> config) {
        String type = nodeType == null ? "" : nodeType.trim().toUpperCase(Locale.ROOT);
        List<String> fields = switch (type) {
            case "ITERATION" -> List.of("itemVariable", "indexVariable", "outputVariable");
            case "LOOP" -> List.of("inputVariable", "indexVariable", "outputVariable");
            default -> List.of();
        };
        List<String> violations = new ArrayList<>();
        for (String field : fields) {
            Object value = config == null ? null : config.get(field);
            if (!(value instanceof String text)) continue;
            String name = text.trim();
            if (name.equals("userId") || name.equals("username") || name.startsWith("__")) {
                violations.add(field + " 不能使用保留变量名 '" + name + "'");
            }
        }
        return List.copyOf(violations);
    }
}
