package com.aetherflow.ai.capability;

import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.provider.ProviderRuntimeCatalog;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AiWorkflowCapabilityServiceTest {

    @Test
    void buildsSnapshotFromLiveRuntimeAndRegisteredExecutors() {
        AiWorkflowCapabilityService service = new AiWorkflowCapabilityService(
                () -> ProviderRuntimeCatalog.status(
                        List.of(AiProviderType.OLLAMA),
                        List.of(new ProviderRuntimeCatalog.RuntimeModel(AiProviderType.OLLAMA, "qwen3:8b")),
                        true,
                        true,
                        false,
                        false,
                        true
                ),
                new DefaultAiNodeExecutorRegistry(List.of(new StubExecutor("LLM"), new StubExecutor("ASR"))),
                new ImageProviderRegistry(List.of())
        );

        AiWorkflowCapabilitiesDTO capabilities = service.current();

        assertThat(capabilities.llmExecutable()).isTrue();
        assertThat(capabilities.whisperExecutable()).isFalse();
        assertThat(capabilities.supportedNodeTypes()).containsExactly("LLM", "WHISPER");
        assertThat(capabilities.unavailableReasons()).containsKey("WHISPER");
    }

    private record StubExecutor(String nodeType) implements AiNodeExecutor {
        @Override
        public AiNodeResult execute(AiNodeExecutionContext context) {
            return new AiNodeResult(nodeType, "SUCCEEDED", Map.of(), List.of());
        }
    }
}
