package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiWorkflowNodeExecutorTest {

    @Test
    void llmNodeCallsAiServiceAndWritesCompletionVariables() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        LlmNodeExecutor executor = new LlmNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "LLM".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "LLM",
                        "SUCCEEDED",
                        Map.of("completionText", "generated answer", "provider", "OLLAMA")
                )));

        NodeResult result = executor.execute(context("llm", Map.of(
                "promptVariable", "question",
                "model", "llama3",
                "temperature", 0.3
        ), Map.of("question", "Explain the workflow")));

        assertThat(result.output()).containsEntry("completionText", "generated answer");
        assertThat(result.variables()).containsEntry("completionText", "generated answer");
        assertThat(result.variables()).containsEntry("completion", "generated answer");
        verify(aiClient).execute(argThat(request ->
                "LLM".equals(request.getNodeType())
                        && "Explain the workflow".equals(request.getPayload().get("prompt"))
                        && "llama3".equals(request.getPayload().get("model"))
        ));
    }

    @Test
    void translateNodeCallsAiServiceAndWritesTranslatedText() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        TranslateWorkflowNodeExecutor executor = new TranslateWorkflowNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "TRANSLATE".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "TRANSLATE",
                        "SUCCEEDED",
                        Map.of("translatedText", "hello", "targetLanguage", "en-US")
                )));

        NodeResult result = executor.execute(context("translate", Map.of(
                "textVariable", "transcription",
                "targetLanguage", "en-US"
        ), Map.of("transcription", "你好")));

        assertThat(result.variables()).containsEntry("translatedText", "hello");
        verify(aiClient).execute(argThat(request ->
                "TRANSLATE".equals(request.getNodeType())
                        && "你好".equals(request.getPayload().get("text"))
                        && "en-US".equals(request.getPayload().get("targetLanguage"))
        ));
    }

    @Test
    void questionClassifierUsesLlmAndWritesRouteVariables() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        QuestionClassifierNodeExecutor executor = new QuestionClassifierNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "LLM".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "LLM",
                        "SUCCEEDED",
                        Map.of("completionText", "billing", "jsonData", Map.of("route", "billing"))
                )));

        NodeResult result = executor.execute(context("classifier", Map.of(
                "inputVariable", "question",
                "routes", "billing,support"
        ), Map.of("question", "Why was I charged?")));

        assertThat(result.variables()).containsEntry("route", "billing");
        assertThat(result.variables()).containsKey("routeJson");
        assertThat(result.branchKey()).isEqualTo("billing");
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
