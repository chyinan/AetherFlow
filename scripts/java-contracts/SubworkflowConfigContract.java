import com.aetherflow.workflow.subworkflow.SubworkflowConfig;
import com.aetherflow.workflow.node.mapping.StructuredDataMapper;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;

/** 无 Maven 依赖的固定版本和映射边界契约验证。 */
public class SubworkflowConfigContract {
    private static int assertions;
    public static void main(String[] args) {
        var config = SubworkflowConfig.from(Map.of("definitionId", 42, "definitionVersion", 3,
                "inputMappings", Map.of("text", "request.items[0].text"), "outputMappings", Map.of("answer", "result")));
        check(config.definitionId() == 42 && config.definitionVersion() == 3);
        check(StructuredDataMapper.readPath(Map.of("request", Map.of("items", List.of(Map.of("text", "你好")))),
                config.inputMappings().get("text")).equals("你好"));
        fails(() -> SubworkflowConfig.from(Map.of("definitionId", 42, "definitionVersion", "latest", "inputMappings", Map.of(), "outputMappings", Map.of())));
        fails(() -> SubworkflowConfig.from(Map.of("definitionId", 42, "definitionVersion", 1.2, "inputMappings", Map.of(), "outputMappings", Map.of())));
        fails(() -> SubworkflowConfig.from(Map.of("definitionId", 42, "definitionVersion", 0, "inputMappings", Map.of(), "outputMappings", Map.of())));
        fails(() -> SubworkflowConfig.from(Map.of("definitionId", 42, "definitionVersion", 1)));
        fails(() -> SubworkflowConfig.from(Map.of("definitionId", 42, "definitionVersion", 1, "inputMappings", Map.of("text", "request..text"), "outputMappings", Map.of())));
        fails(() -> StructuredDataMapper.readPath(Map.of(), "missing.text"));
        var source = new ArrayList<>(List.of("a"));
        Object copied = StructuredDataMapper.readPath(Map.of("items", source), "items");
        source.add("b"); check(copied.equals(List.of("a")));
        System.out.println("通过 " + assertions + " 项纯 Java 固定版本/结构化映射契约断言");
    }
    private static void check(boolean condition) { if (!condition) throw new AssertionError(); assertions++; }
    private static void fails(Runnable action) { try { action.run(); } catch (IllegalArgumentException expected) { assertions++; return; } throw new AssertionError("expected rejection"); }
}
