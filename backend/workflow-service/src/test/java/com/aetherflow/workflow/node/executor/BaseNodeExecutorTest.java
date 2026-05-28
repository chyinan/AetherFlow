package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BaseNodeExecutorTest {

    @Test
    void recordsExecutionAndBuildsNodeResult() throws Exception {
        WorkflowNodeMetrics metrics = new WorkflowNodeMetrics();
        TestNodeExecutor executor = new TestNodeExecutor(metrics);
        DefaultWorkflowContext context = context(Map.of("output", Map.of("ok", true)));

        NodeResult result = executor.execute(context);

        assertThat(result.output()).containsEntry("ok", true);
        assertThat(metrics.snapshot().executionCount()).isEqualTo(1);
        assertThat(metrics.snapshot().retryCount()).isZero();
        assertThat(metrics.snapshot().failCount()).isZero();
    }

    @Test
    void recordsRetryingExecutions() throws Exception {
        WorkflowNodeMetrics metrics = new WorkflowNodeMetrics();
        TestNodeExecutor executor = new TestNodeExecutor(metrics);
        DefaultWorkflowContext context = context(Map.of("output", Map.of("ok", true)));
        context.updateRuntimeState(RuntimeState.RETRYING);

        executor.execute(context);

        assertThat(metrics.snapshot().executionCount()).isEqualTo(1);
        assertThat(metrics.snapshot().retryCount()).isEqualTo(1);
    }

    @Test
    void recordsFailureWhenNodeThrows() {
        WorkflowNodeMetrics metrics = new WorkflowNodeMetrics();
        TestNodeExecutor executor = new TestNodeExecutor(metrics);
        DefaultWorkflowContext context = context(Map.of("fail", true));

        assertThatThrownBy(() -> executor.execute(context))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("node failed");

        assertThat(metrics.snapshot().executionCount()).isEqualTo(1);
        assertThat(metrics.snapshot().failCount()).isEqualTo(1);
    }

    private static DefaultWorkflowContext context(Map<String, Object> config) {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                Map.of(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("node-1", config))
        );
        context.updateCurrentNodeId("node-1");
        return context;
    }

    private static final class TestNodeExecutor extends BaseNodeExecutor {

        private TestNodeExecutor(WorkflowNodeMetrics metrics) {
            super(WorkflowNodeTypes.MOCK, metrics);
        }

        @Override
        protected NodeResult doExecute(com.aetherflow.workflow.runtime.api.WorkflowContext context,
                                       Map<String, Object> config) {
            if (Boolean.TRUE.equals(config.get("fail"))) {
                throw new IllegalStateException("node failed");
            }
            return buildResult(asMap(config.get("output")), Map.of());
        }

        @Override
        public NodeType nodeType() {
            return WorkflowNodeTypes.MOCK;
        }
    }
}
