package com.aetherflow.ai.workflow;

import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DefaultAiNodeExecutorRegistryTest {

    @Test
    void resolvesNodeExecutorCaseInsensitively() {
        AiNodeExecutor asrExecutor = new StubExecutor("ASR");
        DefaultAiNodeExecutorRegistry registry = new DefaultAiNodeExecutorRegistry(List.of(asrExecutor));

        assertThat(registry.getRequired("asr")).isSameAs(asrExecutor);
    }

    @Test
    void rejectsUnsupportedNodeType() {
        DefaultAiNodeExecutorRegistry registry = new DefaultAiNodeExecutorRegistry(List.of(new StubExecutor("SUMMARY")));

        assertThatThrownBy(() -> registry.getRequired("unknown"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("unsupported ai node type");
    }

    private record StubExecutor(String nodeType) implements AiNodeExecutor {
        @Override
        public AiNodeResult execute(AiNodeExecutionContext context) {
            return new AiNodeResult(nodeType, "SUCCEEDED", Map.of("ok", true), List.of());
        }
    }
}
