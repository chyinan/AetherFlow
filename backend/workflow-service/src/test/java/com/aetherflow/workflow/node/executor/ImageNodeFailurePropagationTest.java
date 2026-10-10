package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ImageNodeFailurePropagationTest {
    private static final String TOKEN = "[IMAGE_EXECUTION:COMFYUI:UPLOAD:sourceImage:HTTP]";

    @Test
    void preservesSafeStageFromFailedResultAndAllowsLaterManualRetry() {
        AiWorkflowNodeClient client = mock(AiWorkflowNodeClient.class);
        AbstractAiWorkflowNodeExecutor executor = executor(client);
        AiWorkflowNodeResponseDTO success = new AiWorkflowNodeResponseDTO("IMAGE_GENERATION", "SUCCEEDED", Map.of());
        when(client.execute(any())).thenReturn(Result.fail(ResultCode.SERVICE_UNAVAILABLE, TOKEN + " secret response"))
                .thenReturn(Result.success(success));
        WorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task", Map.of());
        assertThatThrownBy(() -> executor.executeAi(context, "IMAGE_GENERATION", Map.of("provider", "COMFYUI")))
                .isInstanceOf(BusinessException.class).hasMessageContaining(TOKEN).hasMessageNotContaining("secret response");
        assertThat(executor.executeAi(context, "IMAGE_GENERATION", Map.of())).isSameAs(success);
    }

    @Test
    void sanitizesThrownProviderFailureAndKeepsOtherNodeBehavior() {
        AiWorkflowNodeClient client = mock(AiWorkflowNodeClient.class);
        AbstractAiWorkflowNodeExecutor executor = executor(client);
        RuntimeException failure = new BusinessException(ResultCode.SERVICE_UNAVAILABLE, TOKEN + " secret");
        when(client.execute(any())).thenThrow(failure);
        WorkflowContext context = new DefaultWorkflowContext("workflow", "trace", "task", Map.of());
        assertThatThrownBy(() -> executor.executeAi(context, "UPSCALE", Map.of()))
                .hasMessageContaining(TOKEN).hasMessageNotContaining("secret");
        assertThatThrownBy(() -> executor.executeAi(context, "LLM", Map.of())).isSameAs(failure);
    }

    @Test
    void nullResultProducesActionableSafeError() {
        AbstractAiWorkflowNodeExecutor executor = executor(mock(AiWorkflowNodeClient.class));
        assertThatThrownBy(() -> executor.executeAi(new DefaultWorkflowContext("workflow", "trace", "task", Map.of()),
                "IMAGE_GENERATION", Map.of()))
                .hasMessageContaining("[IMAGE_EXECUTION:AI_SERVICE:REQUEST:connectionId:FAILED]");
    }

    private AbstractAiWorkflowNodeExecutor executor(AiWorkflowNodeClient client) {
        return new AbstractAiWorkflowNodeExecutor(WorkflowNodeTypes.IMAGE_GENERATION, new WorkflowNodeMetrics(), client) {
            @Override
            protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
                return NodeResult.success(Map.of(), Map.of());
            }
        };
    }
}
