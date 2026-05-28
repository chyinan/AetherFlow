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

class SummaryNodeExecutorTest {

    @Test
    void callsAiServiceAndWritesSummaryVariables() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setDefaultSummaryLanguage("English");
        SummaryNodeExecutor executor = new SummaryNodeExecutor(new WorkflowNodeMetrics(), aiClient, properties);
        when(aiClient.execute(argThat(request -> "SUMMARY".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "SUMMARY",
                        "SUCCEEDED",
                        Map.of("summary", "short summary", "language", "English")
                )));

        NodeResult result = executor.execute(context(Map.of("prompt", "Focus on actions"),
                Map.of("transcription", "long transcript")));

        assertThat(result.output()).containsEntry("summary", "short summary");
        assertThat(result.variables()).containsEntry("summary", "short summary");
        verify(aiClient).execute(argThat(request ->
                "SUMMARY".equals(request.getNodeType())
                        && "long transcript".equals(request.getPayload().get("text"))
                        && "English".equals(request.getPayload().get("language"))
        ));
    }

    @Test
    void readsTextFromConfiguredVariableName() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setDefaultSummaryLanguage("Chinese");
        SummaryNodeExecutor executor = new SummaryNodeExecutor(new WorkflowNodeMetrics(), aiClient, properties);
        when(aiClient.execute(argThat(request -> "SUMMARY".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "SUMMARY",
                        "SUCCEEDED",
                        Map.of("summary", "short summary")
                )));

        NodeResult result = executor.execute(context(Map.of("textVariable", "transcriptText"),
                Map.of("transcriptText", "long transcript")));

        assertThat(result.variables()).containsEntry("summary", "short summary");
        verify(aiClient).execute(argThat(request ->
                "long transcript".equals(request.getPayload().get("text"))
                        && "Chinese".equals(request.getPayload().get("language"))
        ));
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("summary", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("summary");
        return context;
    }
}
