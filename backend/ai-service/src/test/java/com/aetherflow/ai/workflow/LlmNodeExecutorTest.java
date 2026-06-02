package com.aetherflow.ai.workflow;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.provider.AiProviderRequest;
import com.aetherflow.ai.provider.AiProviderResponse;
import com.aetherflow.ai.provider.AiProviderRouter;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.workflow.executor.LlmNodeExecutor;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LlmNodeExecutorTest {

    @Test
    void sendsPromptToProviderRouterAndReturnsCompletionOutput() {
        AiProviderRouter providerRouter = mock(AiProviderRouter.class);
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultModel("llama3");
        when(providerRouter.complete(argThat(request ->
                "Draft an answer".equals(request.prompt())
                        && "llama3".equals(request.model())
                        && request.options().containsKey("temperature")
        ))).thenReturn(new AiProviderResponse(
                AiProviderType.OLLAMA,
                "llama3",
                "Generated answer",
                Map.of("tokens", 12)
        ));
        LlmNodeExecutor executor = new LlmNodeExecutor(providerRouter, properties);

        AiNodeResult result = executor.execute(new AiNodeExecutionContext(new TaskMessageDTO(), Map.of(
                "prompt", "Draft an answer",
                "temperature", 0.4,
                "maxTokens", 200
        )));

        assertThat(result.nodeType()).isEqualTo("LLM");
        assertThat(result.status()).isEqualTo("SUCCEEDED");
        assertThat(result.output()).containsEntry("completionText", "Generated answer");
        assertThat(result.output()).containsEntry("provider", "OLLAMA");
        assertThat(result.output()).containsEntry("model", "llama3");
        assertThat(result.artifacts()).isEqualTo(List.of());
    }
}
