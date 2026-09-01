package com.aetherflow.workflow.node.executor;

// pattern: Imperative Shell

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.NotifyInternalClient;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.KnowledgeChunkSummary;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestRequest;
import com.aetherflow.workflow.knowledge.dto.KnowledgeDtos.RetrievalTestResponse;
import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeWaitingException;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

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
    void loopDoesNotStopWhenNamedBooleanFlagIsFalse() throws Exception {
        LoopNodeExecutor executor = new LoopNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("loop", Map.of(
                "inputVariable", "state",
                "outputVariable", "loopState",
                "stopWhen", "done",
                "maxIterations", 3
        ), Map.of("state", Map.of("done", false))));

        assertThat(result.output()).containsEntry("iterations", 3);
        assertThat(result.output()).containsEntry("stopped", false);
    }

    @Test
    void loopStopsWhenNamedBooleanFlagIsTrue() throws Exception {
        LoopNodeExecutor executor = new LoopNodeExecutor(new WorkflowNodeMetrics());

        NodeResult result = executor.execute(context("loop", Map.of(
                "inputVariable", "state",
                "outputVariable", "loopState",
                "stopWhen", "done",
                "maxIterations", 3
        ), Map.of("state", Map.of("done", true))));

        assertThat(result.output()).containsEntry("iterations", 0);
        assertThat(result.output()).containsEntry("stopped", true);
    }

    @Test
    void humanNodePausesForExternalApproval() {
        NotifyInternalClient notifyClient = mock(NotifyInternalClient.class);
        when(notifyClient.send(any(NotifyMessageDTO.class))).thenReturn(Result.success());
        HumanInterventionNodeExecutor executor = new HumanInterventionNodeExecutor(
                new WorkflowNodeMetrics(),
                new WorkflowNodeProperties(),
                notifyClient
        );

        assertThatThrownBy(() -> executor.execute(context("human", Map.of("reviewer", "ops"), Map.of("userId", 7L))))
                .isInstanceOf(NodeWaitingException.class)
                .satisfies(exception -> assertThat(((NodeWaitingException) exception).output())
                        .containsEntry("reviewer", "ops")
                        .containsEntry("approved", false));
    }

    @Test
    void humanNodeCanAutoApproveWhenConfigured() throws Exception {
        HumanInterventionNodeExecutor executor = new HumanInterventionNodeExecutor(
                new WorkflowNodeMetrics(),
                new WorkflowNodeProperties(),
                mock(NotifyInternalClient.class)
        );

        NodeResult result = executor.execute(context("human", Map.of(
                "autoApprove", true,
                "reviewer", "ops"
        ), Map.of()));

        assertThat(result.variables()).containsEntry("approved", true);
        assertThat(result.output()).containsEntry("reviewer", "ops");
    }

    @Test
    void humanNodeNotifiesConfiguredChannelsBeforeWaiting() {
        NotifyInternalClient notifyClient = mock(NotifyInternalClient.class);
        when(notifyClient.send(any(NotifyMessageDTO.class))).thenReturn(Result.success());
        HumanInterventionNodeExecutor executor = new HumanInterventionNodeExecutor(
                new WorkflowNodeMetrics(),
                new WorkflowNodeProperties(),
                notifyClient
        );

        assertThatThrownBy(() -> executor.execute(context("human", Map.of(
                "reviewer", "ops",
                "methods", "webapp,telegram"
        ), Map.of("userId", 7L, "draft", "Draft answer"))))
                .isInstanceOf(NodeWaitingException.class);

        ArgumentCaptor<NotifyMessageDTO> messageCaptor = ArgumentCaptor.forClass(NotifyMessageDTO.class);
        verify(notifyClient).send(messageCaptor.capture());
        NotifyMessageDTO message = messageCaptor.getValue();
        assertThat(message.getUserId()).isEqualTo(7L);
        assertThat(message.getEventId()).isEqualTo("human:approval:workflow-1:human:task-1");
        assertThat(message.getEventType()).isEqualTo("HUMAN_APPROVAL_REQUIRED");
        assertThat(message.getPayload())
                .containsEntry("methods", "webapp,telegram")
                .containsEntry("reviewer", "ops")
                .containsEntry("draft", "Draft answer")
                .containsEntry("nodeId", "human");
    }

    @Test
    void codeExecutionIsDisabledByDefault() {
        CodeExecutionNodeExecutor executor = new CodeExecutionNodeExecutor(new WorkflowNodeMetrics(), new WorkflowNodeProperties());

        assertThatThrownBy(() -> executor.execute(context("code", Map.of("language", "python3", "code", "print(1)"), Map.of())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("code execution is disabled");
    }

    @Test
    void codeExecutionPassesInputToConfiguredIsolatedRuntime() throws Exception {
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setCodeExecutionEnabled(true);
        properties.setCodeRuntimeIsolationConfirmed(true);
        CodeExecutionNodeExecutor executor = new CodeExecutionNodeExecutor(
                new WorkflowNodeMetrics(),
                properties,
                (language, code, input, timeoutMs, maxOutputBytes) -> {
                    assertThat(language).isEqualTo("python3");
                    assertThat(code).contains("main");
                    assertThat(input).isEqualTo(Map.of("value", 7));
                    assertThat(timeoutMs).isEqualTo(500);
                    assertThat(maxOutputBytes).isEqualTo(4096);
                    return new com.aetherflow.workflow.node.code.CodeExecutionRuntime.CodeExecutionResult(
                            Map.of("value", 8), "runtime output", 12L, false);
                });

        NodeResult result = executor.execute(context("code", Map.of(
                "language", "python3",
                "code", "def main(payload): return payload",
                "inputVariable", "payload",
                "outputVariable", "result",
                "timeoutMs", 500,
                "maxOutputBytes", 4096
        ), Map.of("payload", Map.of("value", 7))));

        assertThat(result.output()).containsEntry("executed", true);
        assertThat(result.output()).containsEntry("stdout", "runtime output");
        assertThat(result.variables()).containsEntry("result", Map.of("value", 8));
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
                 "metadataFilter", "{\"sourceType\":\"input\"}"
        ), Map.of("question", "pricing")));

        assertThat(result.output()).containsEntry("datasetId", "42");
        assertThat(result.output()).containsEntry("query", "pricing");
        assertThat(result.output()).containsEntry("retrievalCount", 2);
        assertThat(result.output()).containsEntry("metadataFilter", "{\"sourceType\":\"input\"}");
        assertThat(result.variables()).containsEntry("context", "Pricing policy paragraph\n\nBilling FAQ paragraph");
        assertThat(result.variables()).containsEntry("retrievalCount", 2);
        assertThat(result.variables().get("retrievalResults")).asList().hasSize(2);
        verify(knowledgeService).runRetrievalTest(eq(42L), org.mockito.ArgumentMatchers.argThat(request ->
                request != null && "pricing".equals(request.getQuery()) && Integer.valueOf(2).equals(request.getTopK())
        ));
    }

    @Test
    void knowledgeRetrievalNodeUsesVariableWhenFixedQueryIsBlank() throws Exception {
        KnowledgeService knowledgeService = mock(KnowledgeService.class);
        KnowledgeRetrievalNodeExecutor executor = new KnowledgeRetrievalNodeExecutor(new WorkflowNodeMetrics(), knowledgeService);
        when(knowledgeService.runRetrievalTest(eq(42L), any(RetrievalTestRequest.class)))
                .thenReturn(new RetrievalTestResponse("42", "pricing", List.of()));

        executor.execute(context("knowledge", Map.of(
                "datasetId", "42",
                "queryText", "  ",
                "queryVariable", "question"
        ), Map.of("question", "pricing")));

        verify(knowledgeService).runRetrievalTest(eq(42L), org.mockito.ArgumentMatchers.argThat(request ->
                request != null && "pricing".equals(request.getQuery())
        ));
    }

    @Test
    void knowledgeRetrievalNodePrefersConfiguredQueryVariableOverFixedText() throws Exception {
        KnowledgeService knowledgeService = mock(KnowledgeService.class);
        KnowledgeRetrievalNodeExecutor executor = new KnowledgeRetrievalNodeExecutor(new WorkflowNodeMetrics(), knowledgeService);
        when(knowledgeService.runRetrievalTest(eq(42L), any(RetrievalTestRequest.class)))
                .thenReturn(new RetrievalTestResponse("42", "runtime question", List.of()));

        executor.execute(context("knowledge", Map.of(
                "datasetId", "42",
                "queryText", "template example",
                "queryVariable", "question"
        ), Map.of("question", "runtime question")));

        verify(knowledgeService).runRetrievalTest(eq(42L), org.mockito.ArgumentMatchers.argThat(request ->
                request != null && "runtime question".equals(request.getQuery())
        ));
    }

    @Test
    void knowledgeRetrievalNodePassesJsonMetadataFilterToService() throws Exception {
        KnowledgeService knowledgeService = mock(KnowledgeService.class);
        KnowledgeRetrievalNodeExecutor executor = new KnowledgeRetrievalNodeExecutor(new WorkflowNodeMetrics(), knowledgeService);
        when(knowledgeService.runRetrievalTest(eq(42L), any(RetrievalTestRequest.class)))
                .thenReturn(new RetrievalTestResponse("42", "pricing", List.of()));

        executor.execute(context("knowledge", Map.of(
                "datasetId", "42",
                "queryVariable", "question",
                "metadataFilter", "{\"sourceType\":\"input\"}"
        ), Map.of("question", "pricing")));

        verify(knowledgeService).runRetrievalTest(eq(42L), org.mockito.ArgumentMatchers.argThat(request ->
                request != null && "{\"sourceType\":\"input\"}".equals(request.getMetadataFilter())
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
