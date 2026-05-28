package com.aetherflow.workflow.runtime.core;

import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DefaultWorkflowContextTest {

    @Test
    void exposesRuntimeIdentityAndMutableVariablesOnly() {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                Map.of("input", "audio.mp3")
        );

        WorkflowContext nodeView = context;
        nodeView.variables().put("language", "zh-CN");

        assertThat(nodeView.workflowId()).isEqualTo("workflow-1");
        assertThat(nodeView.traceId()).isEqualTo("trace-1");
        assertThat(nodeView.taskId()).isEqualTo("task-1");
        assertThat(nodeView.variables()).containsEntry("input", "audio.mp3")
                .containsEntry("language", "zh-CN");
        assertThat(nodeView.runtimeState()).isEqualTo(RuntimeState.PENDING);
    }

    @Test
    void keepsNodeOutputsReadOnlyForNodeCallers() {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                Map.of()
        );

        context.recordNodeOutput("node-a", NodeResult.success(Map.of("text", "done")));

        assertThat(context.nodeOutputs()).containsKey("node-a");
        assertThatThrownBy(() -> context.nodeOutputs().put("node-b", NodeResult.success(Map.of())))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void variablesSupportConcurrentNodeWrites() {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                Map.of()
        );

        IntStream.range(0, 1000).parallel()
                .forEach(index -> context.variables().put("key-" + index, index));

        assertThat(context.variables()).hasSize(1000);
        assertThat(context.variables()).containsEntry("key-999", 999);
    }

    @Test
    void runtimeInternalsCanAdvanceStateAndCurrentNode() {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                Map.of()
        );

        context.updateRuntimeState(RuntimeState.RUNNING);
        context.updateCurrentNodeId("node-a");

        assertThat(context.runtimeState()).isEqualTo(RuntimeState.RUNNING);
        assertThat(context.currentNodeId()).isEqualTo("node-a");
    }
}
