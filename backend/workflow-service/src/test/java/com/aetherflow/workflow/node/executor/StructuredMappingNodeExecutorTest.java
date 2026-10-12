package com.aetherflow.workflow.node.executor;

// pattern: Imperative Shell

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StructuredMappingNodeExecutorTest {
    @Test
    void whisperResultFeedsTypedPromptListAndLeavesLegacyTranscriptionUntouched() throws Exception {
        var whisper = AiWorkflowNodeResultAdapter.adapt("WHISPER", Map.of(
                "text", "清晨的海边\n远处的帆船",
                "segments", List.of(Map.of("start", 0, "end", 2.5, "text", "清晨的海边"),
                        Map.of("start", 3, "end", 5, "text", "远处的帆船"))));
        Map<String, Object> config = Map.of("transformMode", "structured", "outputVariable", "promptList", "mapping", Map.of(
                "operation", "map", "sourcePath", "segments", "shape", "value",
                "value", Map.of("type", "template", "value", "画面 {{ start }}–{{ end }}：{{ text }}")));
        var result = new TemplateTransformNodeExecutor(new WorkflowNodeMetrics()).execute(context(config, whisper.variables()));
        assertThat(result.variables()).containsEntry("promptList", List.of("画面 0–2.5：清晨的海边", "画面 3–5：远处的帆船"));
        assertThat(result.output()).containsEntry("mappedValue", result.variables().get("promptList"));
        assertThat(whisper.variables()).containsEntry("transcription", "清晨的海边\n远处的帆船");
    }

    @Test
    void malformedStructuredConfigIsABusinessErrorRatherThanSilentTextFallback() {
        assertThatThrownBy(() -> new TemplateTransformNodeExecutor(new WorkflowNodeMetrics()).execute(
                context(Map.of("transformMode", "structured", "mapping", Map.of("operation", "execute")), Map.of())))
                .isInstanceOf(BusinessException.class).hasMessageContaining("operation");
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initial = new LinkedHashMap<>(variables);
        initial.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("mapper", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initial);
        context.updateCurrentNodeId("mapper");
        return context;
    }
}
