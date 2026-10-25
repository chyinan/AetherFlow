package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Collections;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ConditionNodeExecutorTest {

    @Test
    void returnsTrueBranchWhenConditionMatches() throws Exception {
        ConditionNodeExecutor executor = new ConditionNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context(Map.of("status", "READY"), Map.of(
                "variable", "status",
                "operator", "EQUALS",
                "value", "READY",
                "trueBranch", "ready",
                "falseBranch", "blocked"
        ));

        NodeResult result = executor.execute(context);

        assertThat(result.branchKey()).isEqualTo("ready");
    }

    @Test
    void returnsFalseBranchWhenConditionDoesNotMatch() throws Exception {
        ConditionNodeExecutor executor = new ConditionNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context(Map.of("status", "WAITING"), Map.of(
                "variable", "status",
                "operator", "EQUALS",
                "value", "READY",
                "trueBranch", "ready",
                "falseBranch", "blocked"
        ));

        NodeResult result = executor.execute(context);

        assertThat(result.branchKey()).isEqualTo("blocked");
    }

    @Test
    void matchesAnExplicitEmptyStringAndRoutesToTrueBranch() throws Exception {
        ConditionNodeExecutor executor = new ConditionNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context(Map.of("result", ""), Map.of(
                "variable", "result",
                "operator", "EQUALS",
                "value", "",
                "trueBranch", "matched",
                "falseBranch", "unmatched"
        ));

        NodeResult result = executor.execute(context);

        assertThat(result.branchKey()).isEqualTo("matched");
        assertThat(result.output()).containsEntry("matched", true);
    }

    @Test
    void explicitEmptyStringMakesNotEqualsFalse() throws Exception {
        ConditionNodeExecutor executor = new ConditionNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context(Map.of("result", ""), Map.of(
                "variable", "result",
                "operator", "NOT_EQUALS",
                "value", "",
                "trueBranch", "matched",
                "falseBranch", "unmatched"
        ));

        NodeResult result = executor.execute(context);

        assertThat(result.branchKey()).isEqualTo("unmatched");
        assertThat(result.output()).containsEntry("matched", false);
    }

    @Test
    void existsOperatorsIgnoreComparisonValueAndDistinguishEmptyFromNull() throws Exception {
        ConditionNodeExecutor executor = new ConditionNodeExecutor(new WorkflowNodeMetrics());
        NodeResult exists = executor.execute(context(Collections.singletonMap("result", ""), Map.of(
                "variable", "result", "operator", "EXISTS", "value", "ignored",
                "trueBranch", "present", "falseBranch", "missing")));
        NodeResult notExists = executor.execute(context(Collections.singletonMap("result", null), Map.of(
                "variable", "result", "operator", "NOT_EXISTS", "value", "ignored",
                "trueBranch", "missing", "falseBranch", "present")));

        assertThat(exists.branchKey()).isEqualTo("present");
        assertThat(notExists.branchKey()).isEqualTo("missing");
    }

    @Test
    void explicitNullZeroFalseAndNumericStringKeepTheirComparisonSemantics() throws Exception {
        ConditionNodeExecutor executor = new ConditionNodeExecutor(new WorkflowNodeMetrics());
        Map<String, Object> nullConfig = new LinkedHashMap<>();
        nullConfig.put("variable", "result");
        nullConfig.put("operator", "EQUALS");
        nullConfig.put("value", null);
        nullConfig.put("trueBranch", "matched");
        nullConfig.put("falseBranch", "unmatched");
        NodeResult nullMatch = executor.execute(context(Collections.singletonMap("result", null), nullConfig));
        NodeResult zeroMatch = executor.execute(context(Map.of("result", 0), Map.of(
                "variable", "result", "operator", "EQUALS", "value", 0,
                "trueBranch", "matched", "falseBranch", "unmatched")));
        NodeResult falseMatch = executor.execute(context(Map.of("result", false), Map.of(
                "variable", "result", "operator", "EQUALS", "value", false,
                "trueBranch", "matched", "falseBranch", "unmatched")));
        NodeResult numberStringMatch = executor.execute(context(Map.of("result", 10), Map.of(
                "variable", "result", "operator", "EQUALS", "value", "10",
                "trueBranch", "matched", "falseBranch", "unmatched")));

        assertThat(nullMatch.branchKey()).isEqualTo("matched");
        assertThat(zeroMatch.branchKey()).isEqualTo("matched");
        assertThat(falseMatch.branchKey()).isEqualTo("matched");
        assertThat(numberStringMatch.branchKey()).isEqualTo("matched");
    }

    private static DefaultWorkflowContext context(Map<String, Object> variables, Map<String, Object> config) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("condition", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                initialVariables
        );
        context.updateCurrentNodeId("condition");
        return context;
    }
}
