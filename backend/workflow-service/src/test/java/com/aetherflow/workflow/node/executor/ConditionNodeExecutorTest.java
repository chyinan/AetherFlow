package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
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
