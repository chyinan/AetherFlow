package com.aetherflow.workflow.node.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetricsSnapshot;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowNodeMetricsControllerTest {

    @Test
    void exposesWorkflowNodeMetrics() {
        WorkflowNodeMetrics metrics = new WorkflowNodeMetrics();
        metrics.recordExecution(false);
        metrics.recordExecution(true);
        metrics.recordFailure();
        WorkflowNodeMetricsController controller = new WorkflowNodeMetricsController(metrics);

        Result<WorkflowNodeMetricsSnapshot> result = controller.metrics();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().executionCount()).isEqualTo(2);
        assertThat(result.getData().retryCount()).isEqualTo(1);
        assertThat(result.getData().failCount()).isEqualTo(1);
    }
}
