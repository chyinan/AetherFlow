package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MockNodeExecutorTest {

    @Test
    void returnsConfiguredOutputAndVariables() throws Exception {
        MockNodeExecutor executor = new MockNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context(Map.of(
                "output", Map.of("ocr", "pending"),
                "variables", Map.of("mockOcr", "pending")
        ));

        NodeResult result = executor.execute(context);

        assertThat(result.output()).containsEntry("ocr", "pending");
        assertThat(result.variables()).containsEntry("mockOcr", "pending");
    }

    @Test
    void canFailWhenConfigured() {
        MockNodeExecutor executor = new MockNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context(Map.of(
                "fail", true,
                "message", "mock failure"
        ));

        assertThatThrownBy(() -> executor.execute(context))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("mock failure");
    }

    private static DefaultWorkflowContext context(Map<String, Object> config) {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                Map.of(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("mock", config))
        );
        context.updateCurrentNodeId("mock");
        return context;
    }
}
