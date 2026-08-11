package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class StructuralNodeExecutorTest {

    @Test
    void startNodeReturnsConfiguredOutputAndVariables() throws Exception {
        StartNodeExecutor executor = new StartNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context("node-start", Map.of(
                "output", Map.of("started", true),
                "variables", Map.of("fileId", 1001, "inputReady", true)
        ), Map.of("fileId", 2024));

        NodeResult result = executor.execute(context);

        assertThat(result.output()).containsEntry("started", true);
        assertThat(result.variables()).containsEntry("inputReady", true);
        assertThat(result.variables()).containsEntry("fileId", 2024);
    }

    @Test
    void endNodeReturnsConfiguredOutputAndVariables() throws Exception {
        EndNodeExecutor executor = new EndNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context("node-end", Map.of(
                "output", Map.of("ended", true),
                "variables", Map.of("workflowDone", true)
        ));

        NodeResult result = executor.execute(context);

        assertThat(result.output()).containsEntry("ended", true);
        assertThat(result.variables()).containsEntry("workflowDone", true);
    }

    @Test
    void endNodeResolvesOutputValuesThatReferenceWorkflowVariables() throws Exception {
        EndNodeExecutor executor = new EndNodeExecutor(new WorkflowNodeMetrics());
        DefaultWorkflowContext context = context("node-end", Map.of(
                "output", Map.of("answer", "summary")
        ), Map.of("summary", "generated answer"));

        NodeResult result = executor.execute(context);

        assertThat(result.output()).containsEntry("answer", "generated answer");
    }

    private static DefaultWorkflowContext context(String nodeId, Map<String, Object> config) {
        return context(nodeId, config, Map.of());
    }

    private static DefaultWorkflowContext context(String nodeId,
                                                  Map<String, Object> config,
                                                  Map<String, Object> inputVariables) {
        Map<String, Object> variables = new java.util.LinkedHashMap<>(inputVariables);
        variables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of(nodeId, config));
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                variables
        );
        context.updateCurrentNodeId(nodeId);
        return context;
    }
}
