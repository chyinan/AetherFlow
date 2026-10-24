package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * QUESTION_CLASSIFIER 只拿到 completionText 里的 JSON 文本时（ai-service 未回填 jsonData），
 * 仍要解析出分支键；拿不到可用 route 时按既有错误语义失败，不静默落默认分支。
 */
class QuestionClassifierNodeExecutorTest {

    @Test
    void routesBranchKeyFromStructuredCompletionText() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        QuestionClassifierNodeExecutor executor = new QuestionClassifierNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "LLM".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "LLM",
                        "SUCCEEDED",
                        Map.of("completionText", "{\"route\":\"support\",\"confidence\":0.91}")
                )));

        NodeResult result = executor.execute(context(Map.of(
                "inputVariable", "question",
                "routes", List.of("billing", "support")), Map.of("question", "Why was I charged?")));

        assertThat(result.branchKey()).isEqualTo("support");
        assertThat(result.variables())
                .containsEntry("route", "support")
                .containsEntry("routeJson", Map.of("route", "support", "confidence", 0.91D));
    }

    @Test
    void failsLoudlyWhenRouteIsNotConfigured() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        QuestionClassifierNodeExecutor executor = new QuestionClassifierNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "LLM".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "LLM",
                        "SUCCEEDED",
                        Map.of("completionText", "{\"route\":\"refund\"}")
                )));

        assertThatThrownBy(() -> executor.execute(context(Map.of(
                "inputVariable", "question",
                "routes", List.of("billing", "support")), Map.of("question", "Where is my refund?"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("refund")
                .hasMessageContaining("billing, support");
    }

    @Test
    void failsLoudlyWhenCompletionTextIsNotRoutable() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        QuestionClassifierNodeExecutor executor = new QuestionClassifierNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "LLM".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "LLM",
                        "SUCCEEDED",
                        Map.of("completionText", "{\"confidence\":0.6}")
                )));

        assertThatThrownBy(() -> executor.execute(context(Map.of(
                "inputVariable", "question",
                "routes", List.of("billing", "support")), Map.of("question", "Why was I charged?"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("route");
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("classifier", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("classifier");
        return context;
    }
}
