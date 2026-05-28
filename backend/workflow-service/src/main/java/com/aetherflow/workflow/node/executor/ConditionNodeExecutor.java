package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

@Component
public class ConditionNodeExecutor extends BaseNodeExecutor {

    public ConditionNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.CONDITION, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String variable = stringValue(config.get("variable"), "");
        Object actual = variable.isBlank() ? null : context.variables().get(variable);
        String operator = stringValue(config.get("operator"), "EQUALS").trim().toUpperCase(Locale.ROOT);
        Object expected = config.get("value");
        boolean matched = matches(operator, actual, expected);
        String branchKey = matched
                ? stringValue(config.get("trueBranch"), "true")
                : stringValue(config.get("falseBranch"), "false");
        return buildResult(Map.of("matched", matched, "branchKey", branchKey), Map.of())
                .withBranchKey(branchKey);
    }

    private boolean matches(String operator, Object actual, Object expected) {
        return switch (operator) {
            case "NOT_EQUALS" -> !equalsValue(actual, expected);
            case "EXISTS" -> actual != null;
            case "NOT_EXISTS" -> actual == null;
            case "CONTAINS" -> actual != null && expected != null
                    && String.valueOf(actual).contains(String.valueOf(expected));
            case "GREATER_THAN" -> compareNumber(actual, expected) > 0;
            case "LESS_THAN" -> compareNumber(actual, expected) < 0;
            default -> equalsValue(actual, expected);
        };
    }

    private boolean equalsValue(Object actual, Object expected) {
        if (actual == null || expected == null) {
            return actual == expected;
        }
        return String.valueOf(actual).equals(String.valueOf(expected));
    }

    private int compareNumber(Object actual, Object expected) {
        try {
            return new BigDecimal(String.valueOf(actual)).compareTo(new BigDecimal(String.valueOf(expected)));
        } catch (RuntimeException exception) {
            return 0;
        }
    }

    private String stringValue(Object value, String defaultValue) {
        if (value == null || String.valueOf(value).isBlank()) {
            return defaultValue;
        }
        return String.valueOf(value);
    }
}
