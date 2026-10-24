package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class VariableAssignerNodeExecutorTest {

    private final VariableAssignerNodeExecutor executor = new VariableAssignerNodeExecutor(new WorkflowNodeMetrics());

    @Test
    void assignsEveryExplicitJsonLiteralWithoutChangingItsType() throws Exception {
        List<Object> values = new ArrayList<>(java.util.Arrays.asList(
                "", 0, 2.5D, false, true, Map.of("ready", true), List.of("a", 2), null));

        for (Object value : values) {
            Map<String, Object> config = config("LITERAL", "JSON", value, null);
            NodeResult result = execute(config, Map.of());

            assertThat(result.successful()).isTrue();
            assertThat(result.output()).containsKey("result").containsEntry("result", value);
            assertThat(result.variables()).containsKey("result").containsEntry("result", value);
        }
    }

    @Test
    void sourceVariableModeOverridesAnyStoredLiteralIncludingNull() throws Exception {
        Map<String, Object> variables = new HashMap<>();
        variables.put("source", null);

        NodeResult result = execute(config("SOURCE_VARIABLE", "JSON", "stale literal", "source"), variables);

        assertThat(result.variables()).containsKey("result").containsEntry("result", null);
    }

    @Test
    void legacyBlankValueStillFallsBackToConfiguredSourceVariable() throws Exception {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("variable", "result");
        config.put("value", "");
        config.put("sourceVariable", "source");

        NodeResult result = execute(config, Map.of("source", "from upstream"));

        assertThat(result.variables()).containsEntry("result", "from upstream");
    }

    private NodeResult execute(Map<String, Object> config, Map<String, Object> variables) throws Exception {
        Map<String, Object> initial = new HashMap<>(variables);
        initial.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("assign", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task", initial);
        context.updateCurrentNodeId("assign");
        return executor.execute(context);
    }

    private Map<String, Object> config(String mode, String valueType, Object value, String sourceVariable) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("variable", "result");
        config.put("valueMode", mode);
        config.put("valueType", valueType);
        config.put("value", value);
        if (sourceVariable != null) config.put("sourceVariable", sourceVariable);
        return config;
    }
}
