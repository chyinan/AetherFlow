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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * PARAMETER_EXTRACTOR 只拿到 completionText 里的 JSON 文本时也要产出 params/paramsJson；
 * 拿不到 JSON 对象时报可恢复错误，不产出空对象掩盖问题。
 */
class ParameterExtractorNodeExecutorTest {

    @Test
    void extractsParamsFromStructuredCompletionText() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        ParameterExtractorNodeExecutor executor = new ParameterExtractorNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "LLM".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "LLM",
                        "SUCCEEDED",
                        Map.of("completionText", "```json\n{\"orderId\":\"A1\"}\n```")
                )));

        NodeResult result = executor.execute(context(Map.of(
                "inputVariable", "text"), Map.of("text", "订单 A1 需要退款")));

        assertThat(result.variables())
                .containsEntry("params", Map.of("orderId", "A1"))
                .containsEntry("paramsJson", Map.of("orderId", "A1"));
    }

    @Test
    void failsWhenModelReturnsUnstructuredText() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        ParameterExtractorNodeExecutor executor = new ParameterExtractorNodeExecutor(new WorkflowNodeMetrics(), aiClient);
        when(aiClient.execute(argThat(request -> "LLM".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "LLM",
                        "SUCCEEDED",
                        Map.of("completionText", "无法抽取参数")
                )));

        assertThatThrownBy(() -> executor.execute(context(Map.of(
                "inputVariable", "text"), Map.of("text", "订单 A1 需要退款"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("parameter extractor");
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("extractor", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("extractor");
        return context;
    }
}
