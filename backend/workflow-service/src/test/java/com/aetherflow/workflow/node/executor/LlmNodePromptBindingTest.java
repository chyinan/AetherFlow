package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * LLM 节点的提示词取值：没有固定提示词时用变量绑定，
 * 固定值优先于变量，因此固定字面量不能出现在模板里。
 */
class LlmNodePromptBindingTest {

    @Test
    void promptVariableBindingResolvesTheWorkflowInput() {
        LlmNodeExecutor executor = new LlmNodeExecutor(mock(WorkflowNodeMetrics.class), mock(AiWorkflowNodeClient.class));
        Map<String, Object> config = Map.of("promptVariable", "prompt");
        WorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task",
                Map.of("prompt", "用户输入的正文"));

        assertThat(executor.prompt(config, context)).contains("用户输入的正文");
    }

    @Test
    void fixedPromptStillWinsWhenExplicitlyConfigured() {
        LlmNodeExecutor executor = new LlmNodeExecutor(mock(WorkflowNodeMetrics.class), mock(AiWorkflowNodeClient.class));
        Map<String, Object> config = Map.of("prompt", "固定提示词", "promptVariable", "prompt");
        WorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task",
                Map.of("prompt", "用户输入的正文"));

        // 既有契约：用户明确配置的固定提示词优先，不改写。
        assertThat(executor.prompt(config, context)).contains("固定提示词");
    }

    @Test
    void dispatchUsesTheSelectedProviderAndModelTogether() throws Exception {
        AiWorkflowNodeClient client = mock(AiWorkflowNodeClient.class);
        AiWorkflowNodeResponseDTO response = new AiWorkflowNodeResponseDTO();
        response.setOutput(Map.of("completionText", "done"));
        when(client.execute(any())).thenReturn(Result.success(response));
        LlmNodeExecutor executor = new LlmNodeExecutor(new WorkflowNodeMetrics(), client);
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("provider", "openai");
        config.put("model", "gpt-4o-mini");
        config.put("prompt", "hello");
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("llm", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task", variables);
        context.updateCurrentNodeId("llm");

        executor.execute(context);

        ArgumentCaptor<AiWorkflowNodeRequestDTO> request = ArgumentCaptor.forClass(AiWorkflowNodeRequestDTO.class);
        verify(client).execute(request.capture());
        assertThat(request.getValue().getPayload()).containsEntry("provider", "openai").containsEntry("model", "gpt-4o-mini");
    }
}
