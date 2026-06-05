package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WorkflowUtilityNodeExecutorTest {

    @Test
    void templateTransformRendersWorkflowVariables() throws Exception {
        TemplateTransformNodeExecutor executor = new TemplateTransformNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("template", Map.of(
                "template", "Hello {{ name }}",
                "outputVariable", "message"
        ), Map.of("name", "AetherFlow")));

        assertThat(result.output()).containsEntry("renderedText", "Hello AetherFlow");
        assertThat(result.variables()).containsEntry("message", "Hello AetherFlow");
    }

    @Test
    void variableAssignerWritesConfiguredVariable() throws Exception {
        VariableAssignerNodeExecutor executor = new VariableAssignerNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("assigner", Map.of(
                "variable", "answer",
                "sourceVariable", "draft"
        ), Map.of("draft", "ready")));

        assertThat(result.variables()).containsEntry("answer", "ready");
        assertThat(result.output()).containsEntry("answer", "ready");
    }

    @Test
    void variableAggregatorMergesNamedVariables() throws Exception {
        VariableAggregateNodeExecutor executor = new VariableAggregateNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("aggregate", Map.of(
                "variables", List.of("left", "right"),
                "outputVariable", "merged"
        ), Map.of("left", Map.of("a", 1), "right", Map.of("b", 2))));

        assertThat(result.variables()).containsEntry("merged", Map.of("left", Map.of("a", 1), "right", Map.of("b", 2)));
        assertThat(result.output()).containsKey("merged");
    }

    @Test
    void iterationNodePublishesItemsWithoutExecutingNestedSubgraphs() throws Exception {
        IterationNodeExecutor executor = new IterationNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("iteration", Map.of(
                "inputVariable", "items",
                "outputVariable", "iterationItems",
                "maxIterations", 2
        ), Map.of("items", List.of("a", "b", "c"))));

        assertThat(result.output()).containsEntry("count", 2);
        assertThat(result.variables()).containsEntry("iterationItems", List.of("a", "b"));
    }

    @Test
    void loopNodeReturnsBoundedLoopState() throws Exception {
        LoopNodeExecutor executor = new LoopNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("loop", Map.of(
                "inputVariable", "state",
                "outputVariable", "loopState",
                "maxIterations", 3
        ), Map.of("state", Map.of("done", false))));

        assertThat(result.output()).containsEntry("iterations", 3);
        assertThat(result.variables()).containsEntry("loopState", Map.of("done", false));
    }

    @Test
    void humanNodeRequiresExplicitAutoApproval() {
        HumanInterventionNodeExecutor executor = new HumanInterventionNodeExecutor(new WorkflowNodeMetrics(), new WorkflowNodeProperties());

        assertThatThrownBy(() -> executor.execute(context("human", Map.of("reviewer", "ops"), Map.of())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("human intervention requires explicit approval");
    }

    @Test
    void humanNodeCanAutoApproveWhenConfigured() throws Exception {
        HumanInterventionNodeExecutor executor = new HumanInterventionNodeExecutor(new WorkflowNodeMetrics(), new WorkflowNodeProperties());

        NodeResult result = executor.execute(context("human", Map.of(
                "autoApprove", true,
                "reviewer", "ops"
        ), Map.of()));

        assertThat(result.variables()).containsEntry("approved", true);
        assertThat(result.output()).containsEntry("reviewer", "ops");
    }

    @Test
    void codeExecutionIsDisabledByDefault() {
        CodeExecutionNodeExecutor executor = new CodeExecutionNodeExecutor(new WorkflowNodeMetrics(), new WorkflowNodeProperties());

        assertThatThrownBy(() -> executor.execute(context("code", Map.of("language", "python3", "code", "print(1)"), Map.of())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("code execution is disabled");
    }

    @Test
    void knowledgeRetrievalNodeFetchesDatasetChunksAndPublishesContext() throws Exception {
        KnowledgeService knowledgeService = mock(KnowledgeService.class);
        KnowledgeRetrievalNodeExecutor executor = new KnowledgeRetrievalNodeExecutor(new WorkflowNodeMetrics(), knowledgeService);
        when(knowledgeService.runRetrievalTest(eq(42L), org.mockito.ArgumentMatchers.any(RetrievalTestRequest.class)))
                .thenReturn(new RetrievalTestResponse("42", "pricing", List.of(
                        new KnowledgeChunkSummary("chunk-1", "42", "doc-1", "pricing.md", "Pricing policy paragraph", 120, 0.91D, "ready"),
                        new KnowledgeChunkSummary("chunk-2", "42", "doc-2", "faq.md", "Billing FAQ paragraph", 80, 0.83D, "ready")
                )));

        NodeResult result = executor.execute(context("knowledge", Map.of(
                "datasetId", "42",
                "queryVariable", "question",
                "topK", 2,
                "outputVariable", "context",
                "metadataFilter", "enabled"
        ), Map.of("question", "pricing")));

        assertThat(result.output()).containsEntry("datasetId", "42");
        assertThat(result.output()).containsEntry("query", "pricing");
        assertThat(result.output()).containsEntry("retrievalCount", 2);
        assertThat(result.output()).containsEntry("metadataFilter", "enabled");
        assertThat(result.variables()).containsEntry("context", "Pricing policy paragraph\n\nBilling FAQ paragraph");
        assertThat(result.variables()).containsEntry("retrievalCount", 2);
        assertThat(result.variables().get("retrievalResults")).asList().hasSize(2);
        verify(knowledgeService).runRetrievalTest(eq(42L), org.mockito.ArgumentMatchers.argThat(request ->
                request != null && "pricing".equals(request.getQuery()) && Integer.valueOf(2).equals(request.getTopK())
        ));
    }

    private static DefaultWorkflowContext context(String nodeId,
                                                  Map<String, Object> config,
                                                  Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of(nodeId, config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId(nodeId);
        return context;
    }
}
